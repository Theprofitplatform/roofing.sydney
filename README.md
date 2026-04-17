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
- [x] Roof segmentation (SAM 2 via Replicate) — auto-mask + click filter
- [x] Colorbond colour picker + multiply-blend recolour
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
- **Why MapLibre over a static image** — we need direct access to map pixels (via the WebGL canvas) for segmentation. Map is initialised with `preserveDrawingBuffer: true` so `getCanvas().toDataURL()` works.
- **Segmentation** — user clicks the roof → we snapshot the map canvas (capped at 1280px longest edge) → POST to `/api/segment` → Replicate creates a SAM 2 prediction. Client polls `/api/segment/[id]?x=…&y=…` and the server picks the smallest returned mask whose pixel at the click contains roof (using `sharp`). One mask comes back to the client.
- **Why auto-mask + filter, not click-prompts** — `meta/sam-2` on Replicate only wraps `SAM2AutomaticMaskGenerator`; the point-promptable `SAM2ImagePredictor` isn't exposed. Auto-mask + server-side click filter is the standard workaround (confirmed in multiple production integrations).
- **Recolouring** — once the mask is on the client, colour swaps are local: we build a binary alpha array once, then for each Colorbond choice we multiply-blend the tint RGB over the aerial pixels where alpha is set. No further API calls.

## Deployment

Vercel: connect the repo, set the env vars, deploy. The Nearmap tile proxy runs on the Node.js runtime.
