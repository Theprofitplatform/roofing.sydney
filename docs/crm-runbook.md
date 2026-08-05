# CRM runbook — app.roofing.sydney

Everything needed to stand the operator CRM up, verify it, and know what to do
when something misbehaves. The build plan (`roofing-crm-build-plan.md`) explains
*why*; this explains *how*.

---

## 1. Provision Supabase

The application cannot be verified end to end until this exists — it is the one
step that needs a human with an account.

1. Create a project in the **Sydney** region (`ap-southeast-2`). Data about NSW
   homeowners should not leave the country without a reason.
2. SQL editor → run in order:
   `supabase/migrations/0001` … `0012`, then `supabase/seed.sql`.
   Every file is idempotent; re-running changes nothing.
3. Storage → new bucket `quotes`, **private**. No policies. See
   `supabase/README.md` for why it must stay private.
4. Auth → Providers → enable **Email**. Sign in once as John so the
   `on_auth_user_created` trigger provisions his `public.users` row, then turn
   **off** new signups. This is a single-operator tool; leaving magic-link signup
   open means anyone with the URL can mint themselves an account.
5. Auth → URL Configuration → add `https://app.roofing.sydney/auth/callback`.

## 2. Fill the environment

Copy `.env.example` to `.env.production` on the VPS (never commit it) and fill
it. The split matters more than it looks:

| Kind | Examples | How it reaches the app |
|---|---|---|
| **Build args** — inlined into the client and middleware bundles at build time | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_HOST`, `NEXT_PUBLIC_SITE_URL` | `compose.yml` `build.args` |
| **Runtime secrets** — never build args | `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `.env.production` via `env_file` |

A build arg is recoverable from the image's layer history forever. `deploy.sh`
refuses to run if any known secret appears in `compose.yml`'s build args, but the
check only knows the names it was told — add new secrets to that list.

The mirror-image failure is just as sharp: `NEXT_PUBLIC_*` supplied only at
runtime leaves middleware with `undefined`, and every CRM request returns 503
with a message saying exactly that. That message is deliberate — it is the single
most likely deployment mistake in this stack.

## 3. Deploy

```bash
# on the VPS, from the repo checkout
./scripts/deploy.sh
```

It pre-flights the environment, builds, swaps the container, polls
`/api/health`, and rolls back to the previous image if health never comes up.

Before the first deploy, confirm nothing already holds the port — this VPS has a
documented history of port drift causing 502s:

```bash
sudo ss -ltnp | grep 9030
```

nginx terminates TLS on the host and proxies both hostnames to
`127.0.0.1:9030`. The container binds loopback only and never faces the internet.

## 4. Verify a deploy

In order, stopping at the first failure:

```bash
curl -fsS https://app.roofing.sydney/api/health          # 200 + JSON
curl -sI https://roofing.sydney | head -1                # public site unchanged
curl -sI https://app.roofing.sydney/quotes | head -1     # 307 → /login when signed out
```

Then in a browser: request a magic link, land on the dashboard, open **Quotes**,
build a quote from a template, issue it, and open the portal link from the email
in a private window. That last step is the one that exercises the whole spine —
issue → PDF → storage → mail → portal → `viewed_at` → accept → job.

## 5. Local development

No Docker or Postgres needed for anything except the container itself.

```bash
npm run dev            # http://localhost:3000 (public), http://app.localhost:3000 (CRM)
npm test               # calc engine, quote state, pricing, reports, PDF, Xero
npm run test:db        # every migration + RLS against real Postgres 18 in WASM
npm run lint
```

`app.localhost` always routes to the CRM regardless of `NEXT_PUBLIC_APP_HOST`, so
the host split works locally with no `/etc/hosts` edit.

Two traps that have already cost time here:

- **`NEXT_PUBLIC_*` are inlined at build time, including into middleware.** To
  exercise the CRM against a production-shaped build locally, export them
  *before* `npm run build`. Supplying them only at runtime leaves middleware with
  `undefined` and every CRM request 503s.
- **A `sed 's/=.*/=SET/'` check on `.env.local` reports every line as SET even
  when the value is empty.** Check the value's length instead.

To run exactly what the container runs, without Docker:

```bash
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
PORT=9031 node .next/standalone/server.js
```

## 6. Things that will look like bugs and are not

**"It won't let me edit this quote."** Correct. Once issued, a quote's commercial
content is frozen by a database trigger, so the PDF in the client's inbox cannot
silently stop matching the record. Use **Revise** — it raises a linked v2 and
marks the original superseded.

**"The quote issued but the email failed."** Also correct, and deliberate. The
quote is committed as issued *before* mail is attempted. A Resend outage must not
be able to un-draw a quote number or roll back a document the operator believes
went out. Re-send from the quote page.

**"GST won't turn on."** `settings.gst_registered` is a master switch. A trigger
refuses to enable GST on a quote while the business is not registered, because
the prototype let those two flags disagree.

**"A lost opportunity won't save."** It needs a reason. An outcome with no reason
teaches you nothing about why work is being lost, which is the whole point of
recording it.

**Payment terms read as a placeholder.** They are one, on purpose. For NSW
licensed building work the wording must be owner-supplied or professionally
reviewed against the Home Building Act. It is never generated. Replace it in
**Settings → Business** before the first real quote goes out.

## 7. Costs

Phases 0–7 run at roughly **$0–45/month**: Supabase free → $25 when storage and
backups matter, Resend free → $20 above 100 emails/day, the VPS marginal cost of
one more container, and TLS via certbot.

Per-transaction and per-call costs to watch: Stripe 1.7% + $0.30 (AU), Replicate
SAM-2 ~$0.021/run, and Nearmap ~$8/property if the aerial measurement feature
ever ships — cost that one before building it, not after.
