#!/usr/bin/env bash
# Brings the whole riad back from a backup, in one command:
#   - on a NEW server after a crash (database + every stored file, from off-site), or
#   - on the SAME server, to go back to an earlier night.
#
#   bash recover.sh               restore the most recent backup (this server or off-site)
#   bash recover.sh 2026-11-23_030000   restore that night (stamp from Settings -> Backups)
#   bash recover.sh --list        show the backups that can be restored
#
# Needs: this repository in /opt/riad (or any folder) and deploy/.env.production — the copy
# you kept in your password manager (BACKUP_PASSPHRASE and the BACKUP_S3_* keys must be in it).
# Images are downloaded (RIAD_TAG in .env.production picks the version); nothing is built.
set -euo pipefail

cd "$(dirname "$0")"
ENV=.env.production
dc() { docker compose -f docker-compose.prod.yml --env-file "$ENV" "$@"; }
say() { printf '\n== %s\n' "$*"; }
die() { printf '\nrecover: %s\n' "$*" >&2; exit 1; }

NAME="${1:-latest}"

# 1. A fresh server: Docker, firewall, swap.
if ! command -v docker >/dev/null 2>&1; then
  [ "$(id -u)" -eq 0 ] || die "Docker is missing: run as root (sudo -i) so the server can be prepared."
  say "Preparing the server"
  bash ./server-setup.sh
fi

# 2. The configuration must be the real one: same keys as the server that made the backups.
[ -f "$ENV" ] || die "$ENV is missing. Copy your saved .env.production into $(pwd)/ first."
chmod 600 "$ENV" 2>/dev/null || true
grep -q 'CHANGE_ME' "$ENV" && die "$ENV still contains CHANGE_ME: paste your saved copy, not the example."
grep -Eq '^BACKUP_PASSPHRASE=.+' "$ENV" || die "BACKUP_PASSPHRASE is empty in $ENV: backups cannot be opened without it."
if ! grep -Eq '^BACKUP_S3_BUCKET=.+' "$ENV"; then
  echo "note: no off-site storage (BACKUP_S3_*) in $ENV: only backups already on this server can be used."
fi

if [ "$NAME" = "--list" ]; then
  dc up -d --no-build postgres minio >/dev/null
  dc --profile restore run --rm restore list
  exit 0
fi

# 3. The app images (and a stop of anything already running: nothing writes while we restore).
say "Downloading the app"
# A failed download is fine when the image is already on this server; a missing one is not.
dc --profile restore pull --quiet --ignore-pull-failures || true
for img in $(dc --profile restore config --images | sort -u); do
  docker image inspect "$img" >/dev/null 2>&1 || die "image $img could not be downloaded (internet? docker login ghcr.io?)"
done
dc stop api web caddy backup >/dev/null 2>&1 || true

# 4. Database and file storage only. The backup service stays off until the restore is
#    done: otherwise it would save the empty database as the newest backup.
say "Starting the database and the file storage"
dc up -d --no-build postgres minio
for _ in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q postgres)" 2>/dev/null)" = healthy ] && break
  sleep 2
done

say "Restoring backup: $NAME"
dc --profile restore run --rm restore "$NAME" --yes

# 5. Everything else. The API applies any newer database migrations as it starts.
say "Starting the app"
dc up -d --no-build
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q api)" 2>/dev/null)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' "$(dc ps -q api)" 2>/dev/null)" = healthy ] \
  || die "the app did not come up: see 'docker compose -f docker-compose.prod.yml --env-file $ENV logs api'"

DOMAIN=$(sed -n 's/^DOMAIN=//p' "$ENV")
FILES_DOMAIN=$(sed -n 's/^FILES_DOMAIN=//p' "$ENV")
cat <<EOF

Recovered. The riad is back as it was at backup "$NAME".
  - If this is a new server: point the DNS of $DOMAIN and $FILES_DOMAIN to this
    server's IP. HTTPS starts by itself a minute after the DNS is right.
  - Sign in at https://$DOMAIN with your usual account and check today's stays.
  - Tonight's backup runs as usual at 03:00; "Back up now" in Settings makes one at once.
EOF
