#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Onstage — back up the production database.
#
#   ./scripts/backup-db.sh                 # writes backups/onstage-<date>.dump
#   KEEP_DAYS=30 ./scripts/backup-db.sh    # keep a month instead of 14 days
#
# The dump is pg_dump's compressed "custom" format, restored with
# scripts/restore-db.sh. Dumps older than KEEP_DAYS are deleted.
#
# Daily at 02:15 server time, as root (crontab -e):
#   15 2 * * * bash /opt/onstage/scripts/backup-db.sh >> /var/log/onstage-backup.log 2>&1
#
# These files sit on the same server as the database. Copy them somewhere
# else as well (docs/DEPLOY.md, "Backups"), or a lost server loses both.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
target="$BACKUP_DIR/onstage-$stamp.dump"
partial="$target.partial"

echo "$(date -Is) backing up to $target"
# Credentials are read inside the container from its own environment.
if ! "${COMPOSE[@]}" exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --compress=6 --no-owner' \
    > "$partial"; then
  rm -f "$partial"
  echo "$(date -Is) BACKUP FAILED" >&2
  exit 1
fi

# A dump that pg_restore cannot list is not a backup.
if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list < "$partial" > /dev/null; then
  rm -f "$partial"
  echo "$(date -Is) BACKUP FAILED: dump is unreadable" >&2
  exit 1
fi

mv "$partial" "$target"
chmod 600 "$target"
echo "$(date -Is) ok ($(du -h "$target" | cut -f1))"

find "$BACKUP_DIR" -maxdepth 1 -name 'onstage-*.dump' -type f -mtime +"$KEEP_DAYS" -print -delete \
  | sed 's/^/removed old backup: /'
