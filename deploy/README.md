# Deploying roofing.sydney + app.roofing.sydney

One Next.js container serves both hostnames. `src/middleware.ts` routes on the
`Host` header: `app.roofing.sydney` renders `src/app/crm`, everything else
renders the public marketing site.

## First-time setup on the VPS

```bash
# 1. Clone and configure
git clone https://github.com/Theprofitplatform/roofing.sydney.git
cd roofing.sydney
cp .env.example .env.production   # then fill it in — see "Environment" below

# 2. Point DNS at the box
#    A  app.roofing.sydney  →  <VPS IP>

# 3. Build and start
./scripts/deploy.sh

# 4. Wire nginx (verify the port is actually free first)
sudo ss -ltnp | grep 9030
curl -sS http://127.0.0.1:9030/api/health

sudo cp deploy/nginx/app.roofing.sydney.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/app.roofing.sydney.conf \
           /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 5. TLS — run only after DNS resolves
sudo certbot --nginx -d app.roofing.sydney
```

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
- The public site currently deploys to Vercel. Moving it onto this container is
  a matter of adding a second nginx vhost — see the comment at the foot of
  `deploy/nginx/app.roofing.sydney.conf`.
