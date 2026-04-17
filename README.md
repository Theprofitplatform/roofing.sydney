# roofing.sydney

Lead-generation web app for an Australian metal roofing contractor. Homeowners enter their address, see an aerial image of their house, pick a Colorbond colour, and see a realistic recolour of their actual roof. They can then book a free on-site quote.

## Current status (MVP — ready to demo)

- [x] Landing page with AU-restricted Google Places autocomplete
- [x] `/preview` page showing an aerial view of the chosen address (Mapbox Satellite by default; swappable to Nearmap)
- [x] Roof segmentation (Meta SAM 2 via Replicate — auto-mask + server-side click filter)
- [x] Colorbond colour picker + multiply-blend recolour (pure client-side after mask is loaded)
- [x] Lead form → Supabase insert + Resend email to the contractor
- [ ] Polish pass (SEO, legal pages, analytics)

## Stack

- Next.js 15 App Router + TypeScript + Tailwind 4
- MapLibre GL + **Mapbox Satellite** tiles (free tier) — swap `TILE_PROVIDER=nearmap` for paid Nearmap imagery when the contract is in place
- **Replicate** (`meta/sam-2` pinned version) for roof segmentation
- **Supabase** for lead storage (service-role writes; RLS on)
- **Resend** for contractor notifications
- Deployable to **Vercel** with zero config

## Quick start (local)

1. Copy env template and fill in the keys you have:
   ```bash
   cp .env.example .env.local
   ```
2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open http://localhost:3000

**You can get up and running with just `MAPBOX_ACCESS_TOKEN` + `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY`** — the app will work end-to-end. Segmentation needs `REPLICATE_API_TOKEN`; the lead form needs Supabase + Resend.

## Free-tier setup (all five services)

| Service | What to get | Free tier |
|---|---|---|
| [Google Cloud](https://console.cloud.google.com) | Enable "Places API (New)", create an API key, restrict by HTTP referrer | $200/mo free credit |
| [Mapbox](https://account.mapbox.com/access-tokens/) | Default public token (`pk.…`) | 50K tile loads/month free |
| [Replicate](https://replicate.com/account/api-tokens) | API token | $0.10 trial; ~$0.007/click after |
| [Supabase](https://supabase.com) | New project → copy URL, anon key, service role key → run `supabase/schema.sql` in SQL editor | 500MB DB, 50K MAU |
| [Resend](https://resend.com/api-keys) | API key; use `onboarding@resend.dev` as `LEAD_NOTIFICATION_FROM` until you verify a domain | 100 emails/day |

Copy each key into `.env.local`.

## Deploy to Vercel

1. Push to GitHub (already done for this repo).
2. Go to [vercel.com/new](https://vercel.com/new), import this repo.
3. In **Environment Variables**, paste every key from `.env.local` (same names).
4. Click **Deploy**. First build takes ~60s.
5. Add your Vercel URL (e.g. `https://roofing-sydney.vercel.app`) to the allowed-referrers list for your Google Places API key.

That's it — you can share the preview URL with the client.

## Architecture notes

- **Address flow** — Places autocomplete (new `AutocompleteSuggestion` API, AU-restricted) → resolve coords via Place Details → push `/preview?lat=…&lng=…&address=…&placeId=…`.
- **Tile proxy** — `/api/tiles/[z]/[x]/[y]` reads `TILE_PROVIDER` and forwards to Mapbox or Nearmap server-side so the key never reaches the browser.
- **Segmentation** — user clicks the roof → map canvas is snapshotted (capped at 1280px long-edge) → `/api/segment` creates a Replicate prediction → client polls `/api/segment/[id]?x=…&y=…` → server fetches the candidate masks in parallel with `sharp` and returns the smallest one containing the click pixel.
- **Recolour** — once the mask is on the client, the alpha array is built once and every colour change is an instant multiply-blend over the aerial pixels. No extra API calls per colour.
- **Lead capture** — client POST to `/api/leads`; server validates (AU phone, honeypot), inserts into Supabase with the service role key, then best-effort emails the contractor via Resend with `reply-to: customer` so they can reply directly.

## Switching to Nearmap for production

When the client signs a Nearmap contract:
```bash
# in env vars:
TILE_PROVIDER=nearmap
NEARMAP_API_KEY=...
```
No other code changes needed. Mapbox satellite is fine for a demo but Nearmap's 5–7 cm resolution and recency is what makes the "see-your-own-house" experience sell.
