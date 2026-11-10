#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Onstage — deploy or update the production stack on this server.
#
#   ./scripts/deploy.sh              # git pull, build images here, migrate, start
#   ./scripts/deploy.sh --no-pull    # deploy the code already checked out
#   ./scripts/deploy.sh --images     # pull prebuilt images (IMAGE_REGISTRY/IMAGE_TAG
#                                    # in .env.production) instead of building
#
# Safe to run again at any time: unchanged services are left alone, database
# migrations that already ran are skipped. See docs/DEPLOY.md.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
GIT_PULL=1
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-pull) GIT_PULL=0 ;;
    --images) BUILD=0 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mDEPLOY FAILED: %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Pre-flight ────────────────────────────────────────────────────────────
command -v docker >/dev/null || fail "Docker is not installed (docs/DEPLOY.md, step 3)."
docker compose version >/dev/null 2>&1 || fail "The Docker Compose plugin is missing."
[ -f "$ENV_FILE" ] || fail "$ENV_FILE not found. Copy .env.production.example to $ENV_FILE and fill it in."
if grep -nE '^[A-Z0-9_]+=.*CHANGE_ME' "$ENV_FILE" | cut -d= -f1; then
  fail "the variables above in $ENV_FILE still contain CHANGE_ME."
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true
"${COMPOSE[@]}" config --quiet || fail "docker-compose.prod.yml or $ENV_FILE is invalid (see message above)."

# ── 2. Code ──────────────────────────────────────────────────────────────────
if [ "$GIT_PULL" = 1 ] && [ -d .git ]; then
  say "Fetching the latest code"
  git pull --ff-only || fail "git pull failed (local changes on the server?). Fix, or rerun with --no-pull."
fi

# Tag images with the commit, so `docker images` shows what is running and an
# older tag is still there to roll back to.
if [ "$BUILD" = 1 ]; then
  IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M)"
  export IMAGE_TAG
fi
echo "Image tag: ${IMAGE_TAG:-from $ENV_FILE}"

# ── 3. Images ────────────────────────────────────────────────────────────────
if [ "$BUILD" = 1 ]; then
  say "Building images (first build takes 10-20 minutes; later ones reuse the cache)"
  # One at a time: building the Next.js apps in parallel can exhaust a small server's memory.
  for service in migrate api worker web admin; do
    echo "--- $service"
    "${COMPOSE[@]}" build "$service" || fail "building $service failed."
  done
else
  say "Pulling images"
  "${COMPOSE[@]}" pull || fail "pulling images failed."
fi

# ── 4. Database ──────────────────────────────────────────────────────────────
say "Starting Postgres and Redis"
"${COMPOSE[@]}" up -d --wait postgres redis || fail "Postgres or Redis did not become healthy."

say "Applying database migrations"
"${COMPOSE[@]}" run --rm migrate || fail "migrations failed; the running app was NOT touched."

# ── 5. Everything else ───────────────────────────────────────────────────────
say "Starting the stack"
"${COMPOSE[@]}" up -d --remove-orphans

say "Waiting for services to report healthy"
deadline=$((SECONDS + 180))
for service in api web admin caddy; do
  while :; do
    id="$("${COMPOSE[@]}" ps -q "$service")"
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo missing)"
    [ "$status" = healthy ] && { echo "  $service: healthy"; break; }
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "  $service: $status — last log lines:"
      "${COMPOSE[@]}" logs --tail 30 "$service" || true
      fail "$service is not healthy after 3 minutes."
    fi
    sleep 3
  done
done
worker_state="$(docker inspect -f '{{.State.Status}}' "$("${COMPOSE[@]}" ps -q worker)" 2>/dev/null || echo missing)"
echo "  worker: $worker_state"
[ "$worker_state" = running ] || fail "the worker is not running (docker compose ... logs worker)."

# ── 6. Report ────────────────────────────────────────────────────────────────
say "Status"
"${COMPOSE[@]}" ps

API_DOMAIN="$(grep -E '^API_DOMAIN=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d "\"'")"
say "Public health check: https://$API_DOMAIN/v1/health"
if curl -fsS --max-time 15 "https://$API_DOMAIN/v1/health"; then
  echo
else
  echo "Health check failed or https://$API_DOMAIN is unreachable. On a first deploy, check DNS points"
  echo "here and ports 80/443 are open; Caddy keeps retrying the certificate."
  echo "Caddy log: docker compose -f docker-compose.prod.yml --env-file $ENV_FILE logs caddy"
fi

# Drop dangling layers from earlier builds; tagged images stay for rollback.
docker image prune -f >/dev/null || true

say "Deployed ${IMAGE_TAG:-}"
