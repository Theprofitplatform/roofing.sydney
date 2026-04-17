# roofing.sydney

Lead-generation web app for an Australian metal roofing contractor. Homeowners enter their address, see an aerial image of their house, pick a Colorbond colour, and see a realistic recolour of their actual roof. They can then book a free quote.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Nearmap Tiles API for aerial imagery (proxied server-side)
- Google Places API for AU address autocomplete
- Replicate (Meta SAM 2) for roof segmentation — *not wired yet*
- Supabase for lead storage — *not wired yet*
- Resend for contractor notifications — *not wired yet*
- Deployed to Vercel

## Current status

- [x] Scaffolding, env setup, landing page with address autocomplete
- [x] `/preview` page displaying a Nearmap aerial view of the chosen address
- [ ] Roof segmentation (SAM 2 via Replicate)
- [ ] Colorbond colour picker + recolour
- [ ] Lead form → Supabase + Resend

## Getting started

1. Copy `.env.example` to `.env.local` and fill in the keys you have so far:
   - `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` — restrict by HTTP referrer in GCP
   - `NEARMAP_API_KEY` — server-only; used by `/api/nearmap` proxy
2. Install deps and start dev:
   ```bash
   npm install
   npm run dev
   ```
3. Open http://localhost:3000

## Architecture notes

- **Address flow** — homepage has an autocomplete (AU-restricted, `types: address`). On selection we resolve coords via Places Details and push `/preview?lat=…&lng=…&address=…&placeId=…`.
- **Aerial display** — `/preview` renders a MapLibre GL map centred on the address. Tiles are fetched from `/api/nearmap/[z]/[x]/[y]`, which forwards to Nearmap's `v3/Vert` tile endpoint server-side so the key never reaches the browser.
- **Why MapLibre over a static image** — we'll need direct access to map pixels (via the WebGL canvas) for the segmentation step.

## Deployment

Vercel: connect the repo, set the env vars, deploy. The Nearmap tile proxy runs on the Node.js runtime.
