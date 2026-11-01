#!/bin/sh
# Restores a backup made by backup.sh.
#   restore.sh list                          backups on this server and off-site
#   restore.sh <name|latest> --into <db>     test restore into another database (files skipped)
#   restore.sh <name|latest> --yes           REPLACE the live database and stored files
#   options: --db-only (skip files), --offsite (fetch from off-site even if a local copy exists)
# <name> is the stamp shown in Settings → Backups, e.g. 2026-10-31_030000.
set -eu

DIR=/backups
TMP=/tmp/restore
BUCKETS="${S3_BUCKET_PASSPORTS:-riad-passports} ${S3_BUCKET_RECEIPTS:-riad-receipts} ${S3_BUCKET_DOCUMENTS:-riad-documents}"

export RCLONE_CONFIG_STORAGE_TYPE=s3 RCLONE_CONFIG_STORAGE_PROVIDER=Other
export RCLONE_CONFIG_STORAGE_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
export RCLONE_CONFIG_STORAGE_ACCESS_KEY_ID="${S3_ACCESS_KEY:-}" RCLONE_CONFIG_STORAGE_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-}"
export RCLONE_CONFIG_STORAGE_REGION="${S3_REGION:-us-east-1}" RCLONE_CONFIG_STORAGE_FORCE_PATH_STYLE=true
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}"
  export RCLONE_CONFIG_OFFSITE_ENDPOINT="${BACKUP_S3_ENDPOINT:-}" RCLONE_CONFIG_OFFSITE_REGION="${BACKUP_S3_REGION:-auto}"
  export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:-}" RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:-}"
  export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true RCLONE_CONFIG_OFFSITE_FORCE_PATH_STYLE=true
fi
REMOTE="offsite:${BACKUP_S3_BUCKET:-}/${BACKUP_S3_PREFIX:-riad}"

die() { echo "restore: $*" >&2; exit 1; }
names_local() { ls "$DIR" 2>/dev/null | sed -n 's/^db_\(.*\)\.dump\(\.enc\)\{0,1\}$/\1/p'; }
names_offsite() {
  [ -n "${BACKUP_S3_BUCKET:-}" ] || return 0
  for f in daily monthly; do rclone lsf "$REMOTE/$f" 2>/dev/null; done | sed -n 's/^db_\(.*\)\.dump\(\.enc\)\{0,1\}$/\1/p'
}

if [ "${1:-}" = "list" ]; then
  echo "On this server:"; names_local | sort -r | sed 's/^/  /'
  echo "Off-site:"; names_offsite | sort -ru | sed 's/^/  /'
  exit 0
fi

NAME="${1:-}"; [ -n "$NAME" ] || die "usage: restore.sh list | <name|latest> (--into <db> | --yes) [--db-only] [--offsite]"
shift
INTO=""; YES=0; DB_ONLY=0; FROM_OFFSITE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --into) INTO="${2:-}"; shift 2 ;;
    --yes) YES=1; shift ;;
    --db-only) DB_ONLY=1; shift ;;
    --offsite) FROM_OFFSITE=1; shift ;;
    *) die "unknown option $1" ;;
  esac
done
TARGET="${INTO:-$PGDATABASE}"
if [ -z "$INTO" ] && [ "$YES" != 1 ]; then
  die "this replaces the live database \"$PGDATABASE\" and its files: add --yes (or test with --into <db>)"
fi
[ -n "$INTO" ] && DB_ONLY=1 # a test restore never touches the live files

if [ "$NAME" = "latest" ]; then
  if [ "$FROM_OFFSITE" = 1 ]; then NAME=$(names_offsite | sort -r | head -n 1); else NAME=$( (names_local; names_offsite) | sort -r | head -n 1); fi
  [ -n "$NAME" ] || die "no backup found"
fi
echo "restore: backup $NAME -> database \"$TARGET\"$([ "$DB_ONLY" = 1 ] && echo ' (database only)')"

# Fetch: the local copy, else off-site (daily, then monthly).
rm -rf "$TMP" && mkdir -p "$TMP"
# fetch <db|files>: sets FILE to the readable local copy (fetched, then decrypted).
fetch() {
  FILE=""
  for ext in .dump.enc .dump .tar.gz.enc .tar.gz; do
    f="$1_$NAME$ext"
    if [ "$FROM_OFFSITE" != 1 ] && [ -f "$DIR/$f" ]; then
      cp "$DIR/$f" "$TMP/" && FILE="$TMP/$f" && break
    fi
    if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
      for sub in daily monthly; do
        rclone copy --quiet "$REMOTE/$sub/$f" "$TMP/" 2>/dev/null || true
        [ -f "$TMP/$f" ] && FILE="$TMP/$f" && break
      done
      [ -n "$FILE" ] && break
    fi
  done
  [ -n "$FILE" ] || die "$1 file of backup $NAME not found"
  case "$FILE" in
    *.enc)
      [ -n "${BACKUP_PASSPHRASE:-}" ] || die "this backup is encrypted: set BACKUP_PASSPHRASE"
      openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "$FILE" -out "${FILE%.enc}" 2>/dev/null \
        || die "could not decrypt: wrong BACKUP_PASSPHRASE?"
      rm -f "$FILE" && FILE="${FILE%.enc}" ;;
  esac
}

fetch db
dump="$FILE"
if [ -n "$INTO" ]; then
  psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$INTO\"" -c "CREATE DATABASE \"$INTO\""
fi
pg_restore --clean --if-exists --no-owner -d "$TARGET" "$dump"
echo "restore: database restored"

if [ "$DB_ONLY" != 1 ]; then
  fetch files
  mkdir -p "$TMP/files" && tar -xzf "$FILE" -C "$TMP/files"
  for b in $BUCKETS; do
    [ -d "$TMP/files/$b" ] || continue
    rclone sync --quiet "$TMP/files/$b" "storage:$b"
  done
  echo "restore: files restored"
fi
rm -rf "$TMP"
echo "restore: done"
