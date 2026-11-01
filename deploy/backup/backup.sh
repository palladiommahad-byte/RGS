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

# The backup itself; exits non-zero on the first error (runs in a subshell).
do_backup() {
  set -e
  stamp="$1"
  rm -rf "$WORK" && mkdir -p "$WORK/files" "$DIR"
  db="$DIR/db_$stamp.dump"
  files="$DIR/files_$stamp.tar.gz"

  pg_dump --format=custom --no-owner --file="$db.partial"
  mv "$db.partial" "$db"
  # Files object by object, so a backup restores into any S3 storage (MinIO, R2…).
  for b in $BUCKETS; do rclone copy --quiet "storage:$b" "$WORK/files/$b"; done
  tar -czf "$files.partial" -C "$WORK/files" .
  mv "$files.partial" "$files"
  rm -rf "$WORK"

  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    encrypt "$db" && db="$db.enc"
    encrypt "$files" && files="$files.enc"
  elif [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    echo "BACKUP_PASSPHRASE is required to copy backups off the server" >&2
    exit 1
  fi

  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    rclone copy --quiet "$db" "$REMOTE/daily/"
    rclone copy --quiet "$files" "$REMOTE/daily/"
    if [ "$(date +%d)" = "01" ]; then
      rclone copy --quiet "$db" "$REMOTE/monthly/"
      rclone copy --quiet "$files" "$REMOTE/monthly/"
    fi
    rclone delete --quiet --min-age "${REMOTE_KEEP_DAYS}d" "$REMOTE/daily"
    rclone delete --quiet --min-age "$((REMOTE_KEEP_MONTHS * 31))d" "$REMOTE/monthly"
  fi

  find "$DIR" -maxdepth 1 -type f \( -name 'db_*' -o -name 'files_*' \) -mtime +"$KEEP_DAYS" -delete
  echo "$(stat -c %s "$db") $(stat -c %s "$files")" > "$DIR/.last-sizes"
}

# One recorded run: $1 = backup_runs id ("" when the table is not there yet).
run() {
  id="$1"
  stamp=$(date +%Y-%m-%d_%H%M%S)
  record "$id" "status = 'RUNNING', started_at = now(), name = '$stamp'"
  log "backup $stamp started"
  if ( do_backup "$stamp" ) > /tmp/backup.log 2>&1; then
    read -r dbb fb < "$DIR/.last-sizes"
    enc=false; [ -n "${BACKUP_PASSPHRASE:-}" ] && enc=true
    off=false; [ -n "${BACKUP_S3_BUCKET:-}" ] && off=true
    record "$id" "status = 'OK', finished_at = now(), db_bytes = $dbb, files_bytes = $fb, encrypted = $enc, offsite = $off"
    log "backup $stamp done ($dbb + $fb bytes, encrypted=$enc, offsite=$off)"
  else
    err=$(tail -n 3 /tmp/backup.log | tr '\n' ' ' | sed "s/'/''/g" | cut -c1-500)
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
    run "$(new_run MANUAL)"
    ;;
  loop)
    # A run cut short by a restart will never finish: say so.
    sql "UPDATE backup_runs SET status = 'FAILED', finished_at = now(), error = 'Interrupted (backup container restarted)' WHERE status = 'RUNNING'" >/dev/null 2>&1 || true
    while true; do
      # "Back up now" from the app.
      id=$(sql "SELECT id FROM backup_runs WHERE status = 'REQUESTED' ORDER BY requested_at LIMIT 1" 2>/dev/null || true)
      [ -n "$id" ] && run "$id"
      # Nightly, once a day from BACKUP_HOUR (also right after a first start).
      today=$(date +%Y-%m-%d)
      if [ "$(date +%H | sed 's/^0\(.\)/\1/')" -ge "$HOUR" ] &&[ "$(cat "$DIR/.last-scheduled" 2>/dev/null)" != "$today" ]; then
        mkdir -p "$DIR" && echo "$today" > "$DIR/.last-scheduled"
        run "$(new_run SCHEDULED)"
      fi
      sleep 60
    done
    ;;
  *)
    echo "usage: backup.sh once|loop" >&2
    exit 2
    ;;
esac
