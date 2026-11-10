# Deploying Onstage to production

This guide puts the Onstage backend on **one Linux server** so the mobile app,
the public website and the admin CMS work on the internet:

| Address | What it is |
| --- | --- |
| `https://api.onstage.co.za` | The API the mobile app talks to |
| `https://onstage.co.za` | Public website (event/artist pages, `/privacy`, `/terms`, app-link files) |
| `https://www.onstage.co.za` | Redirects to `https://onstage.co.za` |
| `https://admin.onstage.co.za` | Admin CMS (sign-in required) |

Everything runs in Docker containers, started by one command
(`bash scripts/deploy.sh`). HTTPS certificates are obtained and renewed
automatically by Caddy (free, from Let's Encrypt). The mobile app itself is
**not** deployed here; it ships through EAS / the app stores.

What runs on the server:

```
 Internet ──► Caddy (ports 80/443, HTTPS) ──┬─► api    ──┬─► Postgres + PostGIS (private)
                                            ├─► web      └─► Redis (private)
                                            └─► admin
              worker (scheduled jobs: event imports, notifications, account deletion) ──► Postgres
              migrate (runs once per deploy, updates the database structure, then stops)
```

Only Caddy is reachable from the internet. The database and Redis have no
public ports.

---

## 1. Choose a server

### Minimum size

| | Minimum | Comfortable |
| --- | --- | --- |
| CPU | 2 vCPU | 2–4 vCPU |
| Memory | **4 GB** | 8 GB |
| Disk | 60 GB SSD/NVMe | 80–100 GB |
| OS | Ubuntu 24.04 LTS (64-bit) | same |

Why 4 GB: the server builds the app images itself, and building the website
and CMS needs about 2–3 GB of memory on its own. With 2 GB the build will
crash. Add 4 GB of swap either way (step 3) as a safety net.

### Options (prices checked November 2026; **check current pricing** before buying)

Rand/dollar conversions use roughly R18 = $1; exchange rates move.

| Provider | Where | Suggested plan | Approx. monthly cost | Notes |
| --- | --- | --- | --- | --- |
| **xneelo Cloud** (South African) | South Africa | `s-g-2cpu-4gb` (2 vCPU, 4 GB) + ~60 GB premium (NVMe) volume | about **R200 compute + ~R110 storage ≈ R310** (~$17) | Billed per hour in rand, unlimited traffic (fair-use). Self-managed. Price list: xneelo.co.za/cloud. The default 10 GB boot disk is too small: choose a ~60 GB boot volume when creating the server (or ask support how to grow it), since Docker stores everything on the main disk. Data centre city not stated on the price page; ask sales if it matters. |
| **Afrihost Cloud** (South African) | South Africa | Silver (2 vCPU, 4 GB, 200 GB) | **R730** (~$40) | Fixed monthly plans. Self-managed. Data centre location not stated on the price page; ask. |
| **Vultr** (international) | **Johannesburg** | Cloud Compute, 2 vCPU / 4 GB | roughly **$20–24 (~R360–430)** — check current pricing | Has a real Johannesburg region (opened Dec 2022). Prices can differ per location; confirm on vultr.com. Pays in USD by card. |
| Microsoft Azure / Google Cloud | Johannesburg (Azure "South Africa North", Google "africa-south1") | 2 vCPU / 4–8 GB VM | typically higher than the above; **check current pricing** | Fine technically, but more complex billing and setup than this guide needs. |

Not recommended for this setup:

- **AWS Lightsail**: the simple, cheap AWS option ($24/month for 4 GB) is
  **not available in any African region** (its region list has no Cape Town).
  AWS's full EC2 service does have Cape Town (`af-south-1`), but costs more and
  is more complex.
- **DigitalOcean** and **Hetzner**: no South African region (Hetzner is
  Europe/US/Singapore only). They work, but every request from a South African
  phone travels to Europe and back (~150–200 ms extra).

**Recommendation:** xneelo Cloud with the 2 vCPU / 4 GB flavour is the cheapest
local option. Vultr Johannesburg is a good alternative if you prefer a
card-billed international provider. Either way, turn on the provider's
**automatic server snapshots/backups** if offered: it is the cheapest
insurance you can buy.

Other running costs to expect: the domain (you already have it), Firebase
(free tier is likely enough at launch), Sentry (free tier), Expo push (free).

---

## 2. Create the DNS records

At whoever manages DNS for `onstage.co.za`, create these records pointing at
your server's public IPv4 address (shown in the provider's dashboard; below
written as `203.0.113.10`):

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` (i.e. `onstage.co.za`) | `203.0.113.10` | 1 hour |
| A | `www` | `203.0.113.10` | 1 hour |
| A | `api` | `203.0.113.10` | 1 hour |
| A | `admin` | `203.0.113.10` | 1 hour |

If the server also has an IPv6 address, add matching **AAAA** records; if not,
make sure no old AAAA records exist for these names (they would break HTTPS).
Do not turn on a "proxy"/CDN option (e.g. Cloudflare's orange cloud) for now;
see "Behind Cloudflare" at the end if you want that later.

Check from your own computer (may take a few minutes to an hour):

```bash
nslookup api.onstage.co.za
```

---

## 3. First-time server setup

Log in to the server as root (the provider shows how: usually
`ssh root@203.0.113.10`). Then run these, one block at a time.

**a. Updates and firewall** (only SSH, HTTP and HTTPS open):

```bash
apt update && apt upgrade -y
apt install -y git curl ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
```

If your provider has its own firewall ("security groups"), open the same
ports there (22, 80, 443).

Note: Docker publishes ports past `ufw`. That is fine here because only Caddy
publishes any ports, but never add a `ports:` line to Postgres or Redis.

**b. Swap** (protects against running out of memory during builds):

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**c. Docker** (official install script):

```bash
curl -fsSL https://get.docker.com | sh
docker compose version     # should print v2.x
```

**d. Get the code.** The repository is private, so create a read-only deploy
key: run `ssh-keygen -t ed25519 -f ~/.ssh/onstage_deploy -N ""`, add the
contents of `~/.ssh/onstage_deploy.pub` on GitHub under the repository's
*Settings → Deploy keys* (read access only), then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/onstage_deploy
EOF
git clone git@github.com:<your-org>/<onstage-repo>.git /opt/onstage
cd /opt/onstage
git checkout main        # or whichever branch you release from
```

**e. Fill in the settings.**

```bash
cp .env.production.example .env.production
chmod 600 .env.production
nano .env.production
```

Every line marked `[REQUIRED]` must be filled in, and nothing may still say
`CHANGE_ME`. Generate each password/secret with:

```bash
openssl rand -hex 32
```

(use a different one for each of `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`ADMIN_API_TOKEN`, `ADMIN_SESSION_SECRET`, `HOWLER_WEBHOOK_TOKEN`).

The API and worker check their settings when they start. If something is
missing, too short (secrets need at least 32 characters, which
`openssl rand -hex 32` gives you), a development value (e.g. database password
`onstage`), or `CORS_ORIGINS` contains a non-`https://` address, they refuse to
start and their log names the variable (never its value). `deploy.sh` then
stops and prints those log lines; fix `.env.production` and run it again.

- **Firebase** (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY`): Firebase console → Project settings → Service
  accounts → *Generate new private key*. Copy the three fields from the
  downloaded JSON. Keep `FIREBASE_PRIVATE_KEY` on one line, in double quotes,
  exactly as it appears in the JSON (with the `\n` sequences). Both the API
  and the worker need these; without them neither starts. Delete the
  JSON file afterwards; do not leave it on the server or in the repository.
- **ADMIN_USERS**: on your own computer, in the repository, run
  `npm run hash-password -w @onstage/admin -- you@onstage.co.za` and paste the
  output inside single quotes: `ADMIN_USERS='[{"email":"...","passwordHash":"scrypt$..."}]'`.
- **App links** (`ANDROID_CERT_SHA256`, `APPLE_TEAM_ID`): needed so links to
  onstage.co.za open in the app. Get them from `eas credentials` / Play
  Console and your Apple Developer account.
- **Keep a copy** of the finished `.env.production` somewhere safe and
  private (e.g. your password manager). If the server is lost, you need it to
  read your backups' data back in.

**f. Deploy:**

```bash
bash scripts/deploy.sh
```

The first run takes 10–20 minutes (it builds everything). It ends with a
status table and the result of the public health check. On the very first
run Caddy may need a minute to obtain certificates; if the health check
says it could not connect, wait a minute and run the check in section 5.

**g. Turn on daily backups** (section 6).

---

## 4. Updating to a new version

On the server:

```bash
cd /opt/onstage
bash scripts/deploy.sh
```

That pulls the latest code from git, rebuilds the images, applies any
database changes, restarts what changed, and checks health. If the database
migration fails, the script stops **before** touching the running app.

Variants:

- `bash scripts/deploy.sh --no-pull`: deploy what is already checked out
  (e.g. after `git checkout <older-commit>` to roll back code).
- Changed only `.env.production`? Run `bash scripts/deploy.sh --no-pull` too:
  containers whose settings changed are recreated.

Rolling back: images are tagged with the git commit (`docker images | grep
onstage`). The simplest rollback is `git checkout <previous-commit>` followed
by `bash scripts/deploy.sh --no-pull`. **Database migrations are not undone
automatically**; if a release changed the database, ask the developer before
rolling back.

Take a backup before any release that changes the database
(`bash scripts/backup-db.sh`).

---

## 5. What to check after every deploy

1. **API health** (from any computer):

   ```bash
   curl https://api.onstage.co.za/v1/health
   ```

   Expected: `{"status":"ok","database":"up","redis":"up","timestamp":"..."}`.
   An HTTP 503 with `"status":"degraded"` / `"database":"down"` means the API
   cannot reach Postgres; `"redis":"down"` means it still works but slower.

2. **All containers up:**

   ```bash
   cd /opt/onstage
   docker compose -f docker-compose.prod.yml --env-file .env.production ps
   ```

   `api`, `web`, `admin`, `caddy`, `postgres`, `redis` should say
   `(healthy)`; `worker` should say `Up`; `migrate` shows `Exited (0)`, which is
   correct.

3. **Website and CMS:** open `https://onstage.co.za`, `https://www.onstage.co.za`
   (should land on the first), and `https://admin.onstage.co.za` (sign-in page).
   Padlock icon = HTTPS works.

4. **App-link files** (needed for links to open the app):

   ```bash
   curl https://onstage.co.za/.well-known/assetlinks.json
   curl https://onstage.co.za/.well-known/apple-app-site-association
   ```

   Both should list your app, not `[]` / empty `details`.

5. **The app:** open the release build of the mobile app and sign in.

6. **Logs** if anything looks wrong (replace `api` with any service name):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 100 api
   ```

   The worker logs show event imports running on schedule:
   `... logs --tail 100 worker`.

Logs are capped automatically (5 files of 10 MB per service), so they will
not fill the disk.

---

## 6. Backups

`scripts/backup-db.sh` writes a compressed copy of the whole database to
`/opt/onstage/backups/onstage-<date-time>.dump`, checks that it is readable,
and deletes copies older than 14 days (`KEEP_DAYS=30 bash scripts/backup-db.sh`
to keep longer).

**Schedule it daily.** Run `crontab -e` as root and add:

```
15 2 * * * bash /opt/onstage/scripts/backup-db.sh >> /var/log/onstage-backup.log 2>&1
```

Check it is working the next day: `ls -lh /opt/onstage/backups` and
`tail /var/log/onstage-backup.log`.

**Copy backups off the server.** A backup on the same server is lost with
the server. At minimum, also turn on your provider's server snapshots. Better,
copy the `backups/` folder to separate storage daily, e.g. with `rclone` to
an S3-compatible bucket or Google Drive, or periodically download it:

```bash
# from your own computer
scp root@203.0.113.10:/opt/onstage/backups/onstage-*.dump ./
```

The dumps contain personal data (POPIA): store copies only somewhere private
and access-controlled.

### Restoring a backup

```bash
cd /opt/onstage
ls -lh backups/                                   # pick the file
bash scripts/restore-db.sh backups/onstage-20261110-021500.dump
```

It asks you to type `RESTORE`, saves a safety copy of the current database,
stops the apps, replaces the database with the backup, re-applies any newer
database changes, and starts everything again. Then do the checks in section 5.

**Restoring onto a brand-new server:** do section 3 (with the same
`.env.production`), run `bash scripts/deploy.sh` once, copy the `.dump` file to
`/opt/onstage/backups/` and run `restore-db.sh` as above.

---

## 7. Everyday commands

All from `/opt/onstage`. To save typing, add an alias once:
`echo "alias dc='docker compose -f /opt/onstage/docker-compose.prod.yml --env-file /opt/onstage/.env.production'" >> ~/.bashrc && source ~/.bashrc`

| Task | Command |
| --- | --- |
| Status | `dc ps` |
| Logs | `dc logs --tail 100 -f api` (Ctrl+C to stop) |
| Restart one service | `dc restart worker` |
| Stop everything | `dc down` (data is kept) |
| Start everything | `dc up -d` |
| Database shell | `dc exec postgres psql -U onstage onstage` |
| Disk space | `df -h` and `docker system df` |
| Free old images | `docker image prune -a` (keeps images in use) |

**Never** run `dc down -v`: the `-v` deletes the database volume.

Apply operating-system security updates monthly:
`apt update && apt upgrade -y`, then `reboot` if asked. Containers restart by
themselves after a reboot.

---

## Known gaps (for the developer)

- **Build-time Next.js settings.** `NEXT_PUBLIC_WEB_BASE_URL`,
  `NEXT_PUBLIC_SENTRY_DSN` and the Sentry environment are passed as build args,
  so changing them needs a rebuild (`bash scripts/deploy.sh` does one).
  `CDN_HOSTNAME` (image host allow-list) is also read only at build time and is
  not passed yet, because an empty value would override its `'**'` default;
  pass it once posters are served from your own CDN.
- **Admin CMS exposure.** The CMS is on the public internet behind a password.
  To restrict it to your office/home IPs, uncomment the `remote_ip` lines in
  `deploy/Caddyfile`.

## Behind Cloudflare (optional, later)

If you later put Cloudflare's proxy in front, the API would see Cloudflare's
addresses instead of users' and rate limits would misfire. You would need to
add Cloudflare's IP ranges under `trusted_proxies` in `deploy/Caddyfile` and
set `TRUST_PROXY=2` in `.env.production`. Ask the developer before doing this.
