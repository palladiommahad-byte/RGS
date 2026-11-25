# Running on a small VPS (1 vCPU, 1 GB RAM, 20 GB disk)

Tested on a 1 GB budget (e.g. Namecheap **Spark**): the whole app uses about **240 MB
idle** and about **460 MB at its busiest** (passport scan + invoice PDF + Excel export +
30 requests at once), leaving room for Ubuntu and Docker. Every service has a memory cap,
so one busy part cannot starve the others.

| Service | Cap | Idle | Busiest |
|---|---|---|---|
| api | 384 MB | ~95 MB | ~260 MB (passport reader loaded) |
| web | 192 MB | ~55 MB | ~70 MB |
| postgres | 192 MB | ~40 MB | ~70 MB |
| minio (files) | 160 MB | ~40 MB | ~40 MB |
| caddy (HTTPS) | 64 MB | ~13 MB | ~13 MB |
| backup | 192 MB | ~2 MB | short burst at night |

The passport reader frees its ~100 MB again after 3 minutes without a scan.

**The one rule: never build on a 1 GB server.** Building the web app needs ~3 GB.
GitHub builds the images (workflow **Images**, on every push to `main`) and the server only
downloads them.

## 1. Before the server: publish the images (once)

1. Push to `main` (or run **Actions → Images → Run workflow** on GitHub). Wait for the
   green tick (~10 min the first time).
2. On GitHub: your profile → **Packages** → open `riad-api`, `riad-web`, `riad-backup` →
   **Package settings → Change visibility → Public**. (Or keep them private and do step 3b.)

## 2. Prepare the server (once, as root)

Choose **Ubuntu 24.04** when ordering. Then:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/palladiommahad-byte/RGS.git /opt/riad
bash /opt/riad/deploy/server-setup.sh
```

This installs Docker and the firewall (SSH, 80, 443), adds **2 GB swap** (the safety net
for 1 GB of RAM), caps system logs at 100 MB, and removes old images every week.

DNS: two **A records** to the server's IP: `riad.yourdomain.com` and
`files.riad.yourdomain.com` (with Cloudflare: "DNS only", grey cloud).

## 3. Configure and start

```bash
cd /opt/riad/deploy
cp .env.production.example .env.production
nano .env.production          # every CHANGE_ME, the two domains, BACKUP_*, the owner account
chmod 600 .env.production
```

3b. Only if the images stay private: log in once with a GitHub token that has
`read:packages`:

```bash
docker login ghcr.io -u palladiommahad-byte
```

Start (downloads ~1.3 GB of images the first time):

```bash
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.production'
dc pull
dc up -d --no-build
dc exec api npx tsx prisma/seed.ts      # first time only: riad, rooms, owner account
```

Open `https://riad.yourdomain.com/fr/login`, sign in as the owner, change the password,
then delete `SEED_OWNER_PASSWORD` from `.env.production`. The rest of the first-day setup
(settings, taxes, rooms, users, backups) is in the main README.

## 4. Updating

Push to `main`, wait for the **Images** workflow, then on the server:

```bash
cd /opt/riad && git pull && cd deploy
dc run --rm backup once        # safety copy first
dc pull
dc up -d --no-build
```

To go back to an earlier version: set `RIAD_TAG=<short commit>` in `.env.production`,
then `dc pull && dc up -d --no-build`.

## 5. If something goes wrong

**Data lost or damaged, server still running:** in the app, **Settings → Backups →
Restore…** (owners only). Type `RESTORE` to confirm: the backup service first saves a
safety copy of the current data (so it can be undone), restores the latest good backup
(from the server, else from R2), and the app restarts by itself; everyone signs in again.

**Server lost: recover in one command**

On a **new** server after a crash (or the same server, to go back to an earlier night):

```bash
git clone https://github.com/palladiommahad-byte/RGS.git /opt/riad
nano /opt/riad/deploy/.env.production      # paste the copy from your password manager
bash /opt/riad/deploy/recover.sh           # or: recover.sh 2026-11-23_030000
```

It prepares the server if needed, downloads the app, restores the database and every
file from the newest backup (this server, else off-site), and starts everything. Then
point the DNS to the new server. `recover.sh --list` shows what can be restored.

## 6. Keeping an eye on it

```bash
docker stats --no-stream       # memory per service
free -h                        # RAM and swap
df -h /                        # disk (keep it under 80 %)
```

- Disk: images ~2 GB, logs capped, local backups kept 7 days (`BACKUP_KEEP_DAYS`), passport
  photos deleted after 90 days. Off-server backups (R2) are kept 30 days + 12 monthly.
- If a service is ever killed for memory, Docker restarts it on its own; `dc ps` shows it.
- Point a free uptime monitor at `https://riad.yourdomain.com/api/v1/health`.
- When the riad grows (several hundred stays a month and many daily scans), a 2 GB plan
  is the comfortable next step: nothing to change, the same files just have more room.
