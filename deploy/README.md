# Deploying roofing.sydney + app.roofing.sydney

One Next.js container serves both hostnames. `src/middleware.ts` routes on the
`Host` header: `app.roofing.sydney` renders `src/app/crm`, everything else
renders the public marketing site.

## First-time setup on the VPS

⚠ **`~/roofing.sydney` on the VPS is not a spare checkout — it is what serves
the live public site.** Clone the CRM somewhere else so you do not clone over
it or restart it by accident. See "How the public site is actually served".

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
bare `next-server` process started by hand out of `~/roofing.sydney`.

- **Nothing supervises it.** No pm2 entry, no systemd unit. It does not come
  back after a reboot or a crash. This is the real problem.
- **That checkout is 23 commits behind `main`** (at `63c5ae6`) with a dirty
  working tree on top.

The dirty tree looks alarming — 466 lines and 9 untracked files against
`63c5ae6` — but that is measured against a stale base. Compared with `main`,
which is what matters, the live site differs by **4 files, +36/−102**, and
every one of those differences is `main` being *newer*: `SiteNav` extracted
into a component, `next/link` replacing raw anchors, the `/preview` route
wired up, an explicit font stack to stop a pre-hydration serif flash, and ~89
lines of theming in `redesign.css`. The uncommitted work on the box was an
earlier draft of changes that were later committed properly.

**Nothing of value exists only on the VPS.** It was captured anyway, before
that was known, on branch `rescue/vps-live-site-2026-08-08` (commit `eb9d63c`,
branched from `63c5ae6` so its diff is exactly what was live). Keep it as a
belt-and-braces snapshot; there is nothing in it to merge.

So `git pull` in `~/roofing.sydney` is safe — it discards only superseded
draft work. The live site is *behind* `main`, not ahead of it. What still
needs doing is supervising the process and getting it onto a committed
revision; that is W3 in `.planning/TRACKER.md`.
