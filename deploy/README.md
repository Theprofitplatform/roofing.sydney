# Deploying roofing.sydney + app.roofing.sydney

One Next.js container serves both hostnames. `src/middleware.ts` routes on the
`Host` header: `app.roofing.sydney` renders `src/app/crm`, everything else
renders the public marketing site.

## First-time setup on the VPS

⚠ **`~/roofing.sydney` on the VPS is not a spare checkout — it is what serves
the live public site.** See "How the public site is actually served" below.
Clone the CRM somewhere else and never run `git pull` in that directory.

Steps 2, 4 and 5 were completed on 2026-08-08 — DNS resolves, the vhost is
enabled, and TLS is issued. Only steps 1 and 3 remain, and step 3 is blocked
until Supabase exists (`deploy.sh` refuses to run without real keys).

```bash
# 1. Clone and configure — NOT into ~/roofing.sydney, which is the live site
git clone https://github.com/Theprofitplatform/roofing.sydney.git ~/roofing-app
cd ~/roofing-app
cp .env.example .env.production   # then fill it in — see "Environment" below

# 2. Point DNS at the box                                    [DONE 2026-08-08]
#    A  app.roofing.sydney  →  31.97.222.218, DNS-only (grey cloud).
#    Grey-clouded deliberately: certbot's HTTP-01 challenge reaches the origin
#    directly. The apex stays orange-clouded.

# 3. Build and start
./scripts/deploy.sh

# 4. Wire nginx (verify the port is actually free first)      [DONE 2026-08-08]
sudo ss -ltnp | grep 9030
curl -sS http://127.0.0.1:9030/api/health

sudo cp deploy/nginx/app.roofing.sydney.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/app.roofing.sydney.conf \
           /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. TLS — run only after DNS resolves                        [DONE 2026-08-08]
sudo certbot --nginx -d app.roofing.sydney   # expires 2026-11-05, auto-renews
```

Until step 3 runs, `https://app.roofing.sydney` answers **502** — nginx is up
and holding the hostname, but there is no container behind it yet.

## Subsequent deploys

```bash
git pull && ./scripts/deploy.sh
```

`deploy.sh` builds, swaps the container, polls `/api/health` for 30s, and rolls
back to the previous image automatically if it never comes up.

## Environment

`.env.production` holds both categories. The split matters:

| Category | Examples | How it reaches the app |
|---|---|---|
| **Build-time** (`NEXT_PUBLIC_*`) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_HOST` | Docker **build args** — inlined into the client and middleware bundles |
| **Runtime** (everything else) | `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPLICATE_API_TOKEN` | `env_file` at container start |

**Never pass a secret as a build arg.** Build args are recoverable from the
image's layer history. `deploy.sh` asserts that `SUPABASE_SERVICE_ROLE_KEY`
does not appear in `compose.yml`'s build section and refuses to run if it does.

The inverse trap is just as real: because `NEXT_PUBLIC_*` are inlined at build
time, putting them **only** in the runtime env leaves middleware with
`undefined` and the CRM returns:

```
503  CRM unavailable: NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY were not present at
     build time. Pass them as Docker build args, not runtime env.
```

That message is the symptom of a build-arg misconfiguration, not an outage.
The public site keeps serving normally when this happens.

## Verifying a deploy

```bash
curl -sS https://app.roofing.sydney/api/health          # {"status":"ok",...}
curl -sI https://app.roofing.sydney/          | head -1 # 307 → /login
curl -sI https://app.roofing.sydney/login     | head -1 # 200
curl -sI https://roofing.sydney/crm           | head -1 # 404 (CRM not public)
```

## Rollback

`deploy.sh` rolls back automatically on a failed health check. Manually:

```bash
docker images roofing-sydney            # find the previous image id
docker tag <previous-id> roofing-sydney:latest
docker compose up -d
```

## Notes

- The container binds `127.0.0.1` only — it never faces the internet directly.
- Logs: `docker compose logs -f app` (capped at 3 × 10 MB).
- Health endpoint is deliberately dependency-free: it reports that Node is
  serving, not that Supabase is reachable. A liveness probe that fails on a
  third-party outage restarts a healthy container.
- Moving the public site onto this container is a matter of adding a second
  nginx vhost — see the comment at the foot of
  `deploy/nginx/app.roofing.sydney.conf`, and the section below first.

## How the public site is actually served

Not by Vercel — this document claimed that until 2026-08-08 and it was wrong.

`roofing.sydney` (A → `31.97.222.218`, Cloudflare-proxied) resolves to this
same VPS. nginx vhost `roofing.sydney` proxies to `127.0.0.1:3402`, which is a
bare `next-server` process started by hand out of `~/roofing.sydney`. Three
things follow, none of them good:

- **Nothing supervises it.** No pm2 entry, no systemd unit. It does not come
  back after a reboot or a crash.
- **That checkout is 23 commits behind `main`** and carries ~466 lines of
  uncommitted edits plus 9 untracked files — the about/ and contact/ pages,
  `HouseColourViz`, `QuoteForm`, `RoofSwatchViz`, `HeroSlideshow`. The live
  site is *ahead* of `origin/main` in content.
- **`git pull` there destroys that work.** It is preserved on branch
  `rescue/vps-live-site-2026-08-08` (commit `d681107`), taken 2026-08-08, but
  it has not been reviewed or reconciled with `main`.

Reconciling that branch and putting the public site under supervision — ideally
onto this same container, which is what the vhost comment describes — is
tracked as W3 in `.planning/TRACKER.md`. Until then, treat `~/roofing.sydney`
on the VPS as production state, not as a working copy.
