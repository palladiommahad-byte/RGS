#!/bin/sh
# Riad backups: database dump + every stored file, encrypted, copied off the server.
#   backup.sh once   -> one backup now (run it before every upgrade)
#   backup.sh loop   -> nightly at BACKUP_HOUR (riad time), plus "Back up now" from the app
# Each run is recorded in the backup_runs table, which the owner sees in Settings.
set -u

DIR=/backups
WORK=/tmp/backup-work
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"                   # on this server
REMOTE_KEEP_DAYS="${BACKUP_REMOTE_KEEP_DAYS:-30}"     # off-server, daily copies
REMOTE_KEEP_MONTHS="${BACKUP_REMOTE_KEEP_MONTHS:-12}" # off-server, 1st-of-month copies
HOUR="${BACKUP_HOUR:-3}"
BUCKETS="${S3_BUCKET_PASSPORTS:-riad-passports} ${S3_BUCKET_RECEIPTS:-riad-receipts} ${S3_BUCKET_DOCUMENTS:-riad-documents}"

# --- rclone remotes, from the environment (no config file) ---
# storage: the app's own object storage (MinIO in the stack, or R2)
export RCLONE_CONFIG_STORAGE_TYPE=s3 RCLONE_CONFIG_STORAGE_PROVIDER=Other
export RCLONE_CONFIG_STORAGE_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
export RCLONE_CONFIG_STORAGE_ACCESS_KEY_ID="${S3_ACCESS_KEY:-}" RCLONE_CONFIG_STORAGE_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-}"
export RCLONE_CONFIG_STORAGE_REGION="${S3_REGION:-us-east-1}" RCLONE_CONFIG_STORAGE_FORCE_PATH_STYLE=true
# offsite: another provider (Cloudflare R2, Backblaze B2…), only when configured
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
  export RCLONE_CONFIG_OFFSITE_ENDPOINT="${BACKUP_S3_ENDPOINT:-}" RCLONE_CONFIG_OFFSITE_REGION="${BACKUP_S3_REGION:-auto}"
  export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:-}" RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:-}"
  export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true RCLONE_CONFIG_OFFSITE_FORCE_PATH_STYLE=true
fi
REMOTE="offsite:${BACKUP_S3_BUCKET:-}/${BACKUP_S3_PREFIX:-riad}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }
sql() { psql -X -q -t -A -v ON_ERROR_STOP=1 -c "$1"; }
# Records progress in backup_runs; a no-op when there is no row (database not ready).
record() { [ -n "$1" ] && sql "UPDATE backup_runs SET $2 WHERE id = '$1'" >/dev/null 2>&1; return 0; }

encrypt() { # $1 -> $1.enc (AES-256, key derived from BACKUP_PASSPHRASE)
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE -in "$1" -out "$1.enc" && rm -f "$1"
}

# Database and file storage both answer (after a reboot they start at the same time).
ready() {
  pg_isready -q -t 5 >/dev/null 2>&1 \
    && sql "SELECT 1 FROM backup_runs LIMIT 1" >/dev/null 2>&1 \
    && rclone lsd storage: >/dev/null 2>&1
}

fail() { echo "$*" >&2; exit 1; }

# The backup itself, in a subshell. Every step is checked explicitly: `set -e` does not
# work here (it is switched off inside a tested command), so a failure must never pass.
do_backup() {
  stamp="$1"
  rm -rf "$WORK" && mkdir -p "$WORK/files" "$DIR" || fail "cannot prepare $WORK"
  db="$DIR/db_$stamp.dump"
  files="$DIR/files_$stamp.tar.gz"

  pg_dump --format=custom --no-owner --file="$db.partial" || fail "pg_dump failed"
  # A readable archive with the app's tables, or it is not a backup.
  tables=$(pg_restore --list "$db.partial" 2>/dev/null | grep -c ' TABLE DATA ') || true
  [ "${tables:-0}" -gt 0 ] || fail "database dump is empty or unreadable"
  mv "$db.partial" "$db" || fail "cannot keep the dump"

  # Files object by object, so a backup restores into any S3 storage (MinIO, R2…).
  for b in $BUCKETS; do
    rclone copy --quiet "storage:$b" "$WORK/files/$b" || fail "cannot copy the files of $b"
  done
  objects=$(find "$WORK/files" -type f | wc -l)
  tar -czf "$files.partial" -C "$WORK/files" . || fail "cannot archive the files"
  mv "$files.partial" "$files" || fail "cannot keep the archive"
  rm -rf "$WORK"

  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    encrypt "$db" && db="$db.enc" || fail "cannot encrypt the dump"
    encrypt "$files" && files="$files.enc" || fail "cannot encrypt the archive"
  elif [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    fail "BACKUP_PASSPHRASE is required to copy backups off the server"
  fi

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    rclone copy --quiet "$db" "$REMOTE/daily/" || fail "off-site copy of the dump failed"
    rclone copy --quiet "$files" "$REMOTE/daily/" || fail "off-site copy of the files failed"
    # Make sure both arrived whole.
    for f in "$db" "$files"; do
      remote_size=$(rclone size --json "$REMOTE/daily/$(basename "$f")" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')
      [ "$remote_size" = "$(stat -c %s "$f")" ] || fail "off-site copy of $(basename "$f") is incomplete"
    done
    if [ "$(date +%d)" = "01" ]; then
      rclone copy --quiet "$db" "$REMOTE/monthly/" || fail "monthly off-site copy failed"
      rclone copy --quiet "$files" "$REMOTE/monthly/" || fail "monthly off-site copy failed"
    fi
    rclone delete --quiet --min-age "${REMOTE_KEEP_DAYS}d" "$REMOTE/daily" || true
    rclone delete --quiet --min-age "$((REMOTE_KEEP_MONTHS * 31))d" "$REMOTE/monthly" || true
  fi

  find "$DIR" -maxdepth 1 -type f \( -name 'db_*' -o -name 'files_*' \) -mtime +"$KEEP_DAYS" -delete
  echo "$(stat -c %s "$db") $(stat -c %s "$files") $tables $objects" > "$DIR/.last-sizes"
}

# One recorded run: $1 = backup_runs id ("" when the table is not there yet).
run() {
  id="$1"
  stamp=$(date +%Y-%m-%d_%H%M%S)
  record "$id" "status = 'RUNNING', started_at = now(), name = '$stamp'"
  log "backup $stamp started"
  rm -f "$DIR/.last-sizes"
  ( do_backup "$stamp" ) > /tmp/backup.log 2>&1
  rc=$?
  if [ "$rc" -eq 0 ] && [ -s "$DIR/.last-sizes" ]; then
    read -r dbb fb tables objects < "$DIR/.last-sizes"
    enc=false; [ -n "${BACKUP_PASSPHRASE:-}" ] && enc=true
    off=false; [ -n "${BACKUP_S3_BUCKET:-}" ] && off=true
    record "$id" "status = 'OK', finished_at = now(), db_bytes = $dbb, files_bytes = $fb, encrypted = $enc, offsite = $off"
    log "backup $stamp done ($tables tables, $objects files; $dbb + $fb bytes, encrypted=$enc, offsite=$off)"
  else
    # Leave no half-made backup behind (restore "latest" must never pick one).
    rm -f "$DIR"/db_"$stamp".* "$DIR"/files_"$stamp".*
    # The plain reason from fail() is the last line; the details stay in the log.
    err=$(tail -n 1 /tmp/backup.log | sed "s/'/''/g" | cut -c1-300)
    [ -n "$err" ] || err="backup failed (exit $rc)"
    record "$id" "status = 'FAILED', finished_at = now(), error = '$err'"
    log "backup $stamp FAILED: $err"
    return 1
  fi
}

new_run() { # $1 = SCHEDULED | MANUAL -> prints the id, or nothing if the table is missing
  sql "INSERT INTO backup_runs (trigger, status) VALUES ('$1', 'REQUESTED') RETURNING id" 2>/dev/null || true
}

case "${1:-loop}" in
  once)
    i=0
    until ready; do
      i=$((i + 1)); [ "$i" -ge 24 ] && { log "database or storage not reachable"; exit 1; }
      sleep 5
    done
    run "$(new_run MANUAL)"
    ;;
  loop)
    waiting=0
    while true; do
      # Nothing before the database and the file storage answer (e.g. right after a reboot).
      if ! ready; then
        [ "$waiting" = 0 ] && log "waiting for the database and the file storage"
        waiting=1
        sleep 10
        continue
      fi
      if [ "$waiting" = 1 ] || [ -z "${started:-}" ]; then
        started=1; waiting=0
        # A run cut short by a restart will never finish: say so.
        sql "UPDATE backup_runs SET status = 'FAILED', finished_at = now(), error = 'Interrupted (backup container restarted)' WHERE status = 'RUNNING'" >/dev/null 2>&1 || true
      fi
      # "Back up now" from the app.
      id=$(sql "SELECT id FROM backup_runs WHERE status = 'REQUESTED' ORDER BY requested_at LIMIT 1" 2>/dev/null || true)
      [ -n "$id" ] && run "$id"
      # Nightly, once a day from BACKUP_HOUR — or as soon as possible after it (server was
      # off, or restarted). The day counts as done only once a run is recorded.
      today=$(date +%Y-%m-%d)
      if [ "$(date +%H | sed 's/^0\(.\)/\1/')" -ge "$HOUR" ] && [ "$(cat "$DIR/.last-scheduled" 2>/dev/null)" != "$today" ]; then
        id=$(new_run SCHEDULED)
        if [ -n "$id" ]; then
          mkdir -p "$DIR" && echo "$today" > "$DIR/.last-scheduled"
          run "$id"
        fi
      fi
      sleep 60
    done
    ;;
  *)
    echo "usage: backup.sh once|loop" >&2
    exit 2
    ;;
esac
