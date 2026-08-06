# ARC Quoting — upgrade plan, with features harvested from InvoiceMax

**Prototype:** `~/Downloads/Quoting Tool (standalone).html` — "ARC — Quoting", 1.9MB
self-extracting bundle (in-browser Babel + React, 9 JSX modules, ~122KB app source)
**Reference:** `Theprofitplatform/invoicemax` (private, Laravel 11 — read 2026-08-05)
**Target:** `roofing.sydney` — Next.js 15 / React 19 / Supabase / Tailwind 4

---

## Revised headline: the prototype is much further along than a feature list assumes

I'd assumed a form. It's a working quoting app for **Australian Roofing Contractors**
(John Reardon, licence 245723C) with a real domain model, and it already implements
roughly **two-thirds of what I would have told you to take from InvoiceMax**.

More importantly, it does one thing InvoiceMax has **no concept of at all**, and which is
exactly right for a trade: **cost price in, margin markup out**. You enter supplier cost per
line; the client-facing PDF marks every line up by `margin_pct` so the printed lines reconcile
to the total and the customer never sees your cost. There's even a `margin_floor_pct` guard and
per-template margin memory in localStorage. InvoiceMax stores only a sell price — it is a
billing engine, not an estimating tool.

**So the advice inverts.** Don't port InvoiceMax's model into this. Keep this model, and take
from InvoiceMax only the handful of things it genuinely does better — which are, almost
entirely, the things that only matter *once there's a server*.

---

## Already built — don't rebuild any of this

| Area | What's there |
|---|---|
| **Money** | Integer cents throughout, `en-AU` formatting, `moneyShort` for whole dollars |
| **Pricing model** | Cost-in/margin-out with `margin_pct`, `margin_floor_pct`, `default_margin_pct`, per-template margin memory (`arc_margin_mem`) |
| **Quote model** | `quote_number` (`Q-YYYY-NNNN`), status, `roof_type`, `valid_days`, `show_breakdown`, `gst_enabled`, `pdf_layout`, notes, timestamps |
| **Line items** | `{kind: material\|labour, description, qty, unit, unit_cost_cents}`, 7 units, grouped material/labour subtotals |
| **Price book** | 14 seeded items, categories, kind + unit + cost, tap-to-add picker, localStorage recents |
| **Job templates** | 3 (full re-roof / gutter replacement / leak repair) with realistic pre-filled quantities and per-template default margin + validity |
| **Area calculator** | L×W → m², auto-generates sheets + insulation + battens lines, with a ×1.3 batten coverage factor |
| **Photos** | Client-side resize to 1200px / JPEG 0.78 → data URI, captions, include-in-PDF toggle |
| **Clauses** | Inclusions/exclusions snippet library with `is_default`, plus per-quote custom clauses. The seeded wording is good — latent conditions, asbestos, existing falls, AS 1562.1 |
| **PDF** | Two layouts (classic/modern), rendered in-app, printed via a clean `@page A4` print window |
| **Status timeline** | Created → Sent → Viewed |
| **Follow-up intelligence** | `quoteFlags()`: needs-follow-up (sent, unviewed, ≥ `follow_up_days`), expiring (≤7d), expired |
| **Clients** | Search, per-client quote count + total value, inline add/edit modal |
| **Settings** | Business/licence/ABN/ACN, GST registered, deposit toggle + %, defaults for margin/validity/follow-up, payment terms |
| **Margin guard** | `margin_floor_pct` is genuinely enforced — the builder shows an inline warning and a margin-bar flag when a quote drops below the floor |
| **Deposit line** | `deposit_enabled` + `deposit_pct` print *"Deposit due on acceptance (X%)"* on the PDF |
| **UX** | Duplicate quote, unsaved-changes guard, toast system, theme/accent/density, mobile drawer nav |

One thing worth calling out as *correct and rare*: the `payment_terms` field ships as an
explicit placeholder with a comment saying **do not ship AI-generated payment or warranty terms
on licensed building work** — get the owner's or a reviewer's wording, e.g. against the NSW Home
Building Act. Keep that discipline. It's the right call and it should survive the rewrite.

---

## The eight real gaps — ranked

### 1. There is no backend. Everything lives in `localStorage`. 🔴
`LS_KEY = "arc_state_v3"`. Clear site data, switch browsers, or pick up the iPad instead of the
laptop, and **every quote is gone**. This is not a feature gap, it's the thing standing between
a demo and a business tool, and it makes six of the seven gaps below unfixable until it's done.

**Fix:** Supabase tables — `clients`, `quotes`, `quote_items`, `price_book`, `snippets`,
`settings`. Keep the exact field names so the React screens port with near-zero churn.

### 2. Sending an email is simulated. 🔴
`EmailModal.send()` is `setTimeout(() => onSent(), 900)`. It composes a genuinely good email —
correct greeting, address, total, validity — and then sends nothing. "Copy text" is the only
real path today.

**From InvoiceMax:** their send commits `Sent` **first**, then attempts mail inside a
`try/catch`, and on failure reports *"sent as Q-2026-0008 but the email failed"* rather than
500-ing an already-sent document. Copy that ordering exactly. You already have `resend` in
roofing.sydney's dependencies.

### 3. `viewed_at` is sample data. Nothing ever sets it. 🔴
The follow-up nudge — the best commercial idea in the app — keys off `!quote.viewed_at`. In the
seeded quotes it's populated by hand. In production it would be permanently null, so **every
sent quote would flag as needing follow-up forever**.

**Fix:** it comes free with gap 4. A hosted quote link sets `viewed_at` on first open. Without a
link there is nothing to track and the feature is decorative.

### 4. No client acceptance path at all. 🔴
Status goes `draft → sent` and stops. `accepted_at` is cleared on duplicate but never written.
The email says *"sign the acceptance section and reply to this email"* — a print-sign-scan-reply
loop, which is where roofing quotes go to die.

**From InvoiceMax — take this whole pattern, it's the single biggest win available:**
- **Magic-link portal**, no passwords, signed URLs, throttled 5/min (`Portal\AuthController`)
- **Accept / Decline** buttons on a hosted quote page
- **E-signature**: `signed_name` + `signed_at` + `signed_ip`, written in the **same transaction**
  as the accept — that atomicity is the legal artefact, don't split the writes
- **Expired quotes cannot be accepted** — a server-side guard, not a hidden button

### 5. A sent quote is still editable. 🟠
`editQuote()` doesn't check status. Change a sent quote and the PDF sitting in the client's
inbox silently stops matching your record — with no trace that it ever differed.

**From InvoiceMax:** `Estimate::MUTABLE_AFTER_ISSUE` — after issue, only `status` and the
signature fields may change; anything else **throws** in a model hook. Not a disabled button, a
hard failure at the data layer. Revising means raising a new quote. Given the ARC model, the
allowed set is `["status", "sent_at", "viewed_at", "accepted_at", "signed_*"]`.

### 6. Quote numbers are computed client-side and will collide. 🟠
`nextQuoteNumber()` scans the local array for the year's max. Two devices — or one device with
two tabs — issue `Q-2026-0008` twice.

**From InvoiceMax:** a Postgres sequence (`estimate_number_seq START 2000`), drawn **only on
issue**, so drafts show `DRAFT` and never burn a number. Supabase is Postgres — same fix, and
it also stops abandoned drafts from punching holes in your numbering.

### 7. Two GST flags that don't agree, and a hardcoded rate. 🟠
`ARC_BUSINESS.gst_registered: false` and per-quote `gst_enabled: false` are unrelated, and
`computeTotals` hardcodes `preGst * 0.10`.

Note the two apps disagree on *direction*: ARC is GST-**exclusive** (added on top); InvoiceMax
is GST-**inclusive** AU consumer pricing (`rate/(100+rate)`, i.e. 1/11 at 10%). Both are
defensible — but ARC quotes homeowners, and homeowners read a single tax-inclusive number.
Decide deliberately, then make `gst_registered` the master switch that gates the per-quote
toggle, and move the rate to settings.

### 8. The PDF isn't an artefact — it's a live re-render. 🟠
`downloadQuotePdf()` clones the on-screen `.pdf` node into a print window. There's no stored
file, so once anything changes there is no way to reproduce what the client actually received.

**Fix:** on send, render server-side and store the PDF in Supabase Storage against the quote.
That's also the object the portal serves. InvoiceMax's `InvoiceAttachment` is the shape.

---

## Worth adding once the above lands

| Feature | Source | Why |
|---|---|---|
| **Lead pipeline** — `enquiry → qualified → site visit booked → quoted → won/lost`, one-tap advance, `lost` requires a reason | InvoiceMax `LeadStage` | ARC has clients but no pipeline. Your `leads` table on roofing.sydney already captures name/phone/email/address/lat/lng/colour from the public site — that's the top of this funnel, currently disconnected from the quoting tool entirely. **Wiring the website's lead form into the quote builder is the highest-value integration available** and neither app has it. |
| **Activity/task log** with due dates + open-tasks view | InvoiceMax `Activity` | Follow-ups are where roofing quotes are won. The nudge flags tell you *who* to chase; this records *that you did*. |
| **Deposit collection** | `deposit_enabled` + `deposit_pct` already print *"Deposit due on acceptance (10%)"* on the PDF | The promise is printed; there is no way to take the money. On accept, raise the claim. |
| **Variations after acceptance** | Neither app has it | The exclusions wording already promises *"will be quoted as a variation"* — so the document commits to a workflow the tool can't perform. A variation doc referencing its parent quote closes that loop. |
| **Anonymous signed pay link** | InvoiceMax `PayLinkController` | Permanent URL where the signature *is* the credential. Pay the deposit without an account. |
| **Global search** | InvoiceMax `SearchController` | Six small `ILIKE` queries capped at 5 results. Don't reach for full-text at this size. |
| **Roof area from aerial imagery** | roofing.sydney `/api/segment` (SAM2, live) | The `AreaCalc` is L×W typed by hand. You already run SAM2 segmentation on the public site, and `roof-editor.tsx` computes **no area at all** (zero hits for `area\|sqm\|price`). Polygon → m² needs a metres-per-pixel scale from zoom + latitude, then a pitch multiplier. This connects the two halves of what you've already built. |

---

## Missing features — ranked by what they cost you

The eight gaps above are mostly *correctness and plumbing*. These are **product features that
don't exist at all**. Ranked by money lost per week of not having them.

### A. The app has no concept of an outcome 🔴

This is the biggest single hole, and it's cheap to fix.

`StatusPill` renders an **"Accepted"** badge and `quoteFlags()` branches on
`status === "accepted"` — but **nothing in the entire app ever sets it**. There is no
`declined` status at all. Grep across all nine modules: `accepted` appears twice, both as
dead branches.

Consequence: the tool cannot tell you **whether you won**. No win rate. No conversion by job
type. No "what's my pipeline worth". No feedback loop on whether 22% margin on re-roofs is
winning or losing work. You are quoting blind.

Minimum viable: two buttons on the quote view — *Mark accepted* / *Mark declined* — plus a
**loss reason** (price / timing / went elsewhere / no response / job cancelled). One enum field
that changes how you price for the next year. Do this before the portal; it works offline today
and doesn't need a backend.

### B. Follow-up flags are a dead end 🔴

`quoteFlags()` correctly computes needs-follow-up / expiring / expired — then offers you nothing
to do about it. No "send follow-up" action, no snooze, no record that you rang them, no
follow-up counter. The app tells you something is wrong and then shrugs.

Pair it with a **contact log** (see F) and a one-click follow-up email off a template.

### C. No revision lineage 🔴

Client says *"what if we skip the gutter guard?"*. Today you either **edit the sent quote**
(silently invalidating the PDF in their inbox — gap 5) or **duplicate** it (which severs the
link, so you now have two unrelated quotes and no idea they're the same job).

Needed: `Q-2026-0007` → `Q-2026-0007-v2`, parent pointer, previous version marked
*superseded*, and both visible on one job. This is the natural companion to lock-on-issue —
immutability is only tolerable if revising is one click.

### D. Options and choices — the biggest conversion lever, entirely absent 🟠

The quote is one flat list of lines. Two things missing:

- **Good / better / best tiers** — Trimdek vs Klip-Lok, standard vs Ultra, 10 vs 15 year
  warranty. Presenting three options converts materially better than presenting one number, and
  it moves the conversation from *"is this too expensive"* to *"which one"*.
- **Client-selectable extras** — gutter guard, insulation upgrade, whirlybirds, skylight
  reflash. Tick-box lines with a live total. The price book already has these as items; they
  just can't be marked optional.

For a re-roofing business this is likely the highest-revenue feature in the whole list.

### E. Everything after "accepted" 🟠

The tool stops dead at *sent*. Missing: job start date, crew assignment, scheduling,
job status, completion sign-off, and **variations** — which the exclusions text explicitly
promises (*"will be quoted as a variation"*), so the document commits to a workflow the tool
cannot perform.

Also missing on the way **in**: site-visit / measure booking between enquiry and quote. Roofing
quotes aren't instant; the honest flow is ballpark → book a measure → firm quote.

### F. No contact log 🟠

`notes` is per-quote. There's no per-client history — no call notes, no site observations, no
"spoke to the husband, decision is the wife's". For a business where the average job is five
figures and the sales cycle is weeks, this is a real omission.

### G. Templates are hardcoded and uneditable 🟠

`window.ARC_TEMPLATES` is read-only sample data. Settings lets you edit the price book and the
clause snippets, but **not** templates. You cannot save a good quote as a template, cannot add a
fourth job type, cannot adjust the seeded quantities. The three that ship are decent — and
they're all you will ever have.

"Save this quote as a template" is a small feature with an outsized effect on speed.

### H. The price book has no cost maintenance 🟠

Every item is a fixed `unit_cost_cents` with no `updated_at`, no supplier, and no bulk-update.
Steel and Colorbond move; a price book that's six months stale quietly eats your margin —
and **`margin_floor_pct` will not catch it**, because the floor tests the *margin*, not whether
the underlying cost is real. A 20% margin on a cost that rose 12% is not a 20% margin.

Needed: `cost_updated_at` per item, a staleness flag in the picker, and a bulk uplift
(*"+6% on all Sheet roofing"*). Optionally supplier + supplier SKU.

### I. Zero reporting 🟠

No win rate, no average quote value, no quoted-vs-achieved margin, no pipeline value by month,
no conversion by job type or by lead source. The quotes screen has KPI tiles, but they count
things — they don't tell you anything you can act on. Most of this is unlocked the moment (A)
exists.

### J. Smaller, real 🟡

- **Non-photo attachments** — engineer's report, colour selection sheet, manufacturer warranty
- **Insurance / storm jobs** — claim number, insurer, assessor, excess; the recipient is the
  insurer, not the homeowner. Different flow, and a meaningful revenue line in Sydney
- **Strata / multi-building quotes** — the seeded `q3` is a 6-unit strata job crammed into one
  flat list; per-unit or per-building breakdown is missing
- **Multi-user** — one owner, no attribution. A second estimator has nowhere to stand
- **Audit trail** — who changed what, when. This document becomes a contract
- **GST rate in settings** — currently hardcoded `0.10` (see gap 7)

---

## Do **not** port from InvoiceMax

`recurring invoices` · `services lifecycle` · `dunning rules` · `bank reconciliation`
(*they disabled it themselves 2026-07-20*) · `credit notes` · `expenses + P&L` · `BAS/GST
reporting` · `2FA` · `CSV import` · `monthly statements` · `AR aging` · `BECS mandates` ·
`late fees` · **and its totals engine** — ARC's cost/margin model is the better fit and
InvoiceMax has no equivalent. Take only its *rounding discipline* (round once, at the document
level) and its discount-apportionment logic **if** you ever add discounts.

All of it exists because MERTEL bills hundreds of customers the same amount monthly. A roofer
runs a handful of large variable jobs and has an accountant.

**Still worth settling:** does John need invoicing at all, or only quoting? If he invoices in
Xero/MYOB, "accepted" should export a line-item payload, and the entire money-in column
disappears.

---

## Migration notes

- **The prototype is a Claude-artifact-style bundle** — in-browser Babel, `TweaksPanel`,
  `/*EDITMODE-BEGIN*/` markers, `window.*` globals instead of imports. Production needs a real
  build: the 9 modules become ES modules, `window.ARC_*` becomes Supabase queries, and Babel
  leaves the browser. The React component code itself ports largely as-is.
- **The CSS is already Cebu's design system** (Tailwind v4 + OKLCH tokens, per the header
  comment). roofing.sydney is on Tailwind 4 — this should drop in.
- **⚠️ RLS:** `supabase/schema.sql` currently runs `leads` with **RLS enabled and zero
  policies**, writes going through the service-role key from an API route. Fine for a write-only
  public form. An operator app that reads and edits needs real Supabase Auth plus actual
  policies — budget for it, don't treat it as a footnote.
- **Test minimums** (CLAUDE.md): happy path; edge case (`margin_pct: 0`; GST off; empty line
  items); failure case (accepting an expired quote must throw; editing a sent quote must throw).
- **Paid APIs in play:** Replicate (SAM2) and Google Maps aerials both scale with quote volume —
  cost them before the measurement feature goes live.

---

## Suggested order

1. **Supabase schema + auth + RLS** — port state off `localStorage`, keep field names identical
2. **Server-side quote numbering** (sequence, drawn on issue only)
3. **Lock-on-issue immutability** — the throwing guard, before anything can go out the door
4. **Real email send** via Resend, with the commit-then-send ordering
5. **Hosted quote page**: magic link → sets `viewed_at` → accept/decline + e-signature
   *(this one step activates the follow-up engine that's already written and unlocks #3, #4)*
6. **Stored PDF artefact** on send
7. Public lead form → quote builder wiring
8. Deposit claim on accept · variations · SAM2 area → line items

---

**Decompiled source for reference:**
`/private/tmp/claude-501/-Users-bang-projects-clawdbot/e19a2bc9-327c-466a-b0e0-4cc3a8653b00/scratchpad/arc-src/`
(`09f81a37…` data model · `47d437f3…` helpers/calc · `b030b6cc…` builder · `686464c4…` PDF ·
`4956cd14…` settings · `25c86727…` quotes list · `2a766903…` view/email · `7791ce34…` clients ·
`df0bcc09…` nav)
**InvoiceMax clone:** `…/scratchpad/invoicemax`
