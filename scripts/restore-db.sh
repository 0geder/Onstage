#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Onstage — restore the production database from a backup-db.sh dump.
#
#   ./scripts/restore-db.sh backups/onstage-20261110-021500.dump
#
# REPLACES the current database with the dump. The app is offline for the
# duration (usually under a few minutes). A safety backup of the current
# database is taken first, so a mistaken restore can itself be undone.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")

dump="${1:-}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "Usage: $0 <path to .dump file>" >&2; exit 2; }

echo "This will REPLACE the live Onstage database with: $dump"
read -r -p "Type RESTORE to continue: " answer
[ "$answer" = RESTORE ] || { echo "Cancelled."; exit 1; }

echo "==> Safety backup of the current database"
bash "$ROOT/scripts/backup-db.sh"

echo "==> Stopping the apps"
"${COMPOSE[@]}" stop api worker web admin

echo "==> Recreating the database"
"${COMPOSE[@]}" exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "==> Restoring"
"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$dump"

echo "==> Applying any migrations newer than the dump, and starting the apps"
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d

echo "Restore complete. Check: docker compose -f docker-compose.prod.yml --env-file $ENV_FILE ps"
