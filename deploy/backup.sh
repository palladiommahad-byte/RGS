#!/bin/sh
# Database dump (pg_dump custom format) + archive of the object-storage files.
#   backup.sh once   -> one backup now (run it before every upgrade)
#   backup.sh loop   -> one backup every day at BACKUP_HOUR (riad time), forever
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
DIR=/backups

run_backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  mkdir -p "$DIR"
  pg_dump --format=custom --no-owner --file="$DIR/db_$stamp.dump.partial"
  mv "$DIR/db_$stamp.dump.partial" "$DIR/db_$stamp.dump"
  if [ -d /files ]; then
    tar -czf "$DIR/files_$stamp.tar.gz.partial" -C /files .
    mv "$DIR/files_$stamp.tar.gz.partial" "$DIR/files_$stamp.tar.gz"
  fi
  find "$DIR" -type f \( -name 'db_*' -o -name 'files_*' \) -mtime +"$KEEP_DAYS" -delete
  echo "$(date) backup $stamp done"
}

case "${1:-loop}" in
  once) run_backup ;;
  loop)
    while true; do
      # Sleep until the next BACKUP_HOUR:00.
      now=$(date +%s)
      next=$(date -d "$(date +%Y-%m-%d) $HOUR:00:00" +%s 2>/dev/null || echo $((now + 86400)))
      [ "$next" -le "$now" ] && next=$((next + 86400))
      sleep $((next - now))
      run_backup || echo "$(date) backup FAILED"
    done
    ;;
  *) echo "usage: backup.sh once|loop" >&2; exit 2 ;;
esac
