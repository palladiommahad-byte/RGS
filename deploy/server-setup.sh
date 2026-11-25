#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 VPS (as root), sized for small
# servers such as a 1 vCPU / 1 GB / 20 GB plan:
#   - Docker + the compose plugin
#   - firewall: SSH, HTTP, HTTPS only
#   - 2 GB swap (the safety net that lets six services live in 1 GB of RAM)
#   - capped system logs and a weekly clean-up of old Docker images (20 GB disk)
# Safe to run again: every step checks first.
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/deploy/server-setup.sh | bash
#   (or copy the file to the server and: bash server-setup.sh)
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo -i)."; exit 1; }

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "== Automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq unattended-upgrades ufw >/dev/null
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

echo "== Firewall"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw --force enable
fi

echo "== Swap (2 GB)"
if ! swapon --show=NAME --noheadings | grep -q .; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Use RAM first, swap only for what sits idle.
cat > /etc/sysctl.d/90-riad.conf <<'EOF'
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null

echo "== System logs capped at 100 MB"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/90-riad.conf <<'EOF'
[Journal]
SystemMaxUse=100M
EOF
systemctl restart systemd-journald

echo "== Weekly clean-up of unused Docker images"
cat > /etc/cron.weekly/riad-docker-prune <<'EOF'
#!/bin/sh
docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
EOF
chmod +x /etc/cron.weekly/riad-docker-prune

echo
free -h
df -h /
echo
echo "Done. Next: clone the repository into /opt/riad and follow deploy/SMALL-SERVER.md."
