/**
 * The client-facing quote PDF.
 *
 * These assertions read the rendered bytes rather than the component tree,
 * because the defect that matters is not "did it render" — it is "what number
 * did the client see". A quote whose paper disagrees with the portal is a
 * commercial dispute, so the figures are decoded back out of the PDF and
 * compared against `quote-pricing`, the same source the portal prices from.
 */

import { register } from "node:module";
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import type { Client, Quote, QuoteItem, Settings } from "../src/lib/db/types.ts";

// The document is `.tsx`; node's native type stripping erases types but does
// not transform JSX, so this suite brings its own loader. Registered before the
// dynamic imports below — a static import would be hoisted above it.
register("./tsx-loader.mjs", import.meta.url);

type RenderQuotePdf = typeof import("../src/lib/pdf/render.ts").renderQuotePdf;
type PriceSelection = typeof import("../src/lib/quote-pricing.ts").priceSelection;
type Money = typeof import("../src/lib/money.ts").money;

let renderQuotePdf: RenderQuotePdf;
let priceSelection: PriceSelection;
let money: Money;

before(async () => {
  ({ renderQuotePdf } = await import("../src/lib/pdf/render.ts"));
  ({ priceSelection } = await import("../src/lib/quote-pricing.ts"));
  ({ money } = await import("../src/lib/money.ts"));
});

/**
 * Pull the visible text back out of a rendered PDF.
 *
 * Content streams are deflate-compressed and the text is written as
 * `[<hex> kern <hex>] TJ` runs, where the hex bytes are the character codes.
 * Decoding them is what lets a test assert on the printed price.
 */
function pdfText(buf: Buffer): string {
  const out: string[] = [];
  const bin = buf.toString("latin1");
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(bin)) !== null) {
    const start = m.index + m[0].length;
    const end = bin.indexOf("endstream", start);
    if (end < 0) continue;

    let inflated: Buffer;
    try {
      inflated = zlib.inflateSync(Buffer.from(bin.slice(start, end), "latin1"));
    } catch {
      continue; // Fonts and images are streams too; only text is of interest.
    }

    for (const run of inflated.toString("latin1").matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      let word = "";
      for (const hex of run[1].matchAll(/<([0-9a-fA-F]+)>/g)) {
        for (let i = 0; i < hex[1].length; i += 2) {
          word += String.fromCharCode(parseInt(hex[1].slice(i, i + 2), 16));
        }
      }
      out.push(word);
    }
  }
  return out.join("\n");
}

const CLIENT: Client = {
  id: "c1", name: "J Homeowner", phone: null, email: null,
  property_address: "12 Ridge St, Balgowlah", lat: null, lng: null, source: null,
  lead_id: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  created_by: null,
};

const SETTINGS = {
  id: 1, business_name: "Australian Roofing Contractors", legal_name: "ARC Pty Ltd",
  owner_name: null, licence_no: null, abn: null, acn: null, phone: null, email: null,
  site: null, address: null, logo_path: null, gst_registered: false, gst_rate: 10,
  deposit_enabled: false, deposit_pct: 0, default_margin_pct: 20, default_valid_days: 30,
  margin_floor_pct: 10, follow_up_days: 3, payment_terms: null,
  updated_at: "2026-08-01T00:00:00Z",
} satisfies Settings;

const quote = (over: Partial<Quote> = {}): Quote => ({
  id: "q1", opportunity_id: null, client_id: "c1", quote_number: "Q-2026-0001",
  status: "sent", parent_quote_id: null, version: 1, roof_type: "Colorbond re-roof",
  notes: null, valid_days: 30, show_breakdown: true, pdf_layout: "classic",
  margin_pct: 0, gst_enabled: false, gst_rate: 10, include_photos: false,
  subtotal_cents: null, total_cents: null, accepted_total_cents: null,
  selected_tier: null, pdf_path: null, portal_token: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  sent_at: "2026-08-01T00:00:00Z", viewed_at: null, accepted_at: null,
  declined_at: null, declined_reason: null, signed_name: null, signed_at: null,
  signed_ip: null, created_by: null, ...over,
});

const item = (id: string, over: Partial<QuoteItem> = {}): QuoteItem => ({
  id, quote_id: "q1", kind: "material", description: `Line ${id}`, qty: 1,
  unit: "ea", unit_cost_cents: 100_000, is_optional: false, tier: null, sort: 0,
  ...over,
});

const base = (input: Partial<Parameters<RenderQuotePdf>[0]> = {}) => ({
  quote: quote(), client: CLIENT, settings: SETTINGS, items: [item("a")],
  clauses: [], ...input,
});

describe("quote PDF — happy path", () => {
  test("prints the marked-up total, and the quote number", async () => {
    const items = [item("a", { unit_cost_cents: 100_000 })];
    const q = quote({ margin_pct: 20 });

    const text = pdfText(await renderQuotePdf(base({ quote: q, items })));

    // $1,000 cost + 20% margin = $1,200 to the client.
    assert.match(text, /\$1,200\.00/);
    assert.match(text, /Q-2026-0001/);
  });

  test("the printed total equals what the portal would price", async () => {
    const items = [
      item("a", { unit_cost_cents: 123_456 }),
      item("b", { kind: "labour", qty: 3, unit_cost_cents: 9_500 }),
    ];
    const q = quote({ margin_pct: 22, gst_enabled: true });

    const expected = priceSelection(q, items, { tier: null, optionalIds: [] }).display.total;
    const text = pdfText(await renderQuotePdf(base({ quote: q, items })));

    assert.match(text, new RegExp(money(expected).replace(/[$.]/g, "\\$&")));
  });
});

describe("quote PDF — cost never leaves the building", () => {
  test("the supplier cost is nowhere in the document", async () => {
    const items = [item("a", { unit_cost_cents: 123_456 })];
    const q = quote({ margin_pct: 25 });

    const text = pdfText(await renderQuotePdf(base({ quote: q, items })));

    assert.ok(!text.includes("$1,234.56"), "supplier cost was printed on a client document");
    assert.match(text, /\$1,543\.20/); // cost + 25%
  });

  test("the internal margin figure is never printed", async () => {
    const items = [item("a", { unit_cost_cents: 100_000 })];
    const q = quote({ margin_pct: 30 });

    const text = pdfText(await renderQuotePdf(base({ quote: q, items })));

    assert.ok(!/margin/i.test(text), "the word 'margin' appeared on a client document");
    assert.ok(!text.includes("$300.00"), "the margin amount was printed");
  });
});

describe("quote PDF — tiers", () => {
  const tiered = [
    item("base", { unit_cost_cents: 100_000 }),
    item("g", { tier: "good", unit_cost_cents: 200_000, description: "GOODLINE" }),
    item("b", { tier: "better", unit_cost_cents: 300_000, description: "BETTERLINE" }),
    item("x", { tier: "best", unit_cost_cents: 400_000, description: "BESTLINE" }),
  ];

  test("only one tier is priced — not the sum of all three", async () => {
    const text = pdfText(await renderQuotePdf(base({ items: tiered })));

    // Base $1,000 + cheapest tier $2,000. The bug this guards against printed
    // $10,500 by summing every tier and the extras together.
    assert.match(text, /\$3,000\.00/);
    assert.ok(!text.includes("$10,500.00"), "every tier was summed into the total");
  });

  test("the tiers not chosen are absent, and the chosen one is named", async () => {
    const text = pdfText(await renderQuotePdf(base({ items: tiered })));

    assert.ok(text.includes("GOODLINE"), "the priced tier's line item is missing");
    assert.ok(!text.includes("BETTERLINE"), "an unpriced tier was printed");
    assert.ok(!text.includes("BESTLINE"), "an unpriced tier was printed");
    // The option label is uppercased by the stylesheet, hence the loose match.
    assert.match(text, /option\s*\W?\s*good/i);
  });

  test("an explicit selection overrides the cheapest-tier default", async () => {
    const text = pdfText(
      await renderQuotePdf(base({ items: tiered, selection: { tier: "best", optionalIds: [] } })),
    );

    assert.match(text, /\$5,000\.00/); // base $1,000 + best $4,000
    assert.ok(text.includes("BESTLINE"));
    assert.ok(!text.includes("GOODLINE"));
  });

  test("an accepted quote reproduces the tier recorded on the row", async () => {
    const q = quote({ selected_tier: "better", status: "accepted" });
    const text = pdfText(await renderQuotePdf(base({ quote: q, items: tiered })));

    assert.match(text, /\$4,000\.00/); // base $1,000 + better $3,000
    assert.ok(text.includes("BETTERLINE"));
  });
});

describe("quote PDF — optional extras", () => {
  const withExtra = [
    item("base", { unit_cost_cents: 100_000 }),
    item("e", { is_optional: true, unit_cost_cents: 50_000, description: "EXTRALINE" }),
  ];

  test("an extra is listed but excluded from the total", async () => {
    const text = pdfText(await renderQuotePdf(base({ items: withExtra })));

    assert.match(text, /\$1,000\.00/); // the total: base scope only
    assert.ok(!text.includes("$1,500.00"), "an unselected extra was billed in the total");
    assert.ok(text.includes("EXTRALINE"), "the extra was not offered at all");
    assert.match(text, /optional extras/i);
  });

  test("a selected extra moves into the priced scope", async () => {
    const text = pdfText(
      await renderQuotePdf(base({ items: withExtra, selection: { tier: null, optionalIds: ["e"] } })),
    );

    assert.match(text, /\$1,500\.00/);
    assert.ok(!/optional extras/i.test(text), "a selected extra was still offered as optional");
  });

  test("an extra belonging to an unchosen tier is not advertised", async () => {
    const items = [
      item("base", { unit_cost_cents: 100_000 }),
      item("g", { tier: "good", unit_cost_cents: 200_000 }),
      item("x", { tier: "best", unit_cost_cents: 400_000 }),
      item("e", { is_optional: true, tier: "best", unit_cost_cents: 50_000, description: "BESTEXTRA" }),
    ];

    const text = pdfText(await renderQuotePdf(base({ items })));

    assert.ok(!text.includes("BESTEXTRA"), "an extra from an unchosen tier was offered");
  });
});

describe("quote PDF — failure modes", () => {
  test("a missing party is refused rather than printed blank", async () => {
    await assert.rejects(
      () => renderQuotePdf(base({ client: undefined as unknown as Client })),
      /client is required/,
    );
    await assert.rejects(
      () => renderQuotePdf(base({ settings: undefined as unknown as Settings })),
      /settings is required/,
    );
    await assert.rejects(
      () => renderQuotePdf(base({ items: undefined as unknown as QuoteItem[] })),
      /items must be an array/,
    );
  });

  test("a malformed timestamp throws instead of printing 'Invalid Date'", async () => {
    const q = quote({ sent_at: "not-a-date" });
    await assert.rejects(() => renderQuotePdf(base({ quote: q })), /not a valid date/);
  });
});

describe("quote PDF — artefact stability", () => {
  test("the same input renders the same page content", async () => {
    const args = base();
    const [a, b] = [await renderQuotePdf(args), await renderQuotePdf(args)];

    assert.equal(pdfText(a), pdfText(b));
    // Documents the caveat in quote-document.tsx: pdfkit writes a random /ID
    // into the trailer, so the buffers themselves are not comparable.
    assert.ok(!a.equals(b));
  });
});
