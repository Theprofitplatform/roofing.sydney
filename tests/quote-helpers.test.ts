import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

import type { Quote, QuoteItem, Tier } from "../src/lib/db/types.ts";

// `helpers.ts` imports `@/lib/money` for real, not just for types, so the alias
// has to be resolvable before it loads — hence the hook and the dynamic import.
register("./quotes-alias-loader.mjs", import.meta.url);

const { defaultScope, pdfFilename, quoteLabel, quoteTotalCents, scopeFromQuoteItems } =
  await import("../src/app/crm/quotes/helpers.ts");

/**
 * The quotes screens do their arithmetic through `lib/money` and
 * `lib/quote-pricing`. What lives in `helpers.ts` is the thin layer above that:
 * which lines a quote is offering by default, and what the list should show a
 * quote is worth. Both are easy to get subtly wrong in ways nobody notices until
 * a month's numbers are already out.
 */

type Line = { is_optional: boolean; tier: Tier | null; description: string };

const line = (over: Partial<Line> = {}): Line => ({
  is_optional: false,
  tier: null,
  description: "Colorbond Trimdek",
  ...over,
});

describe("defaultScope", () => {
  test("keeps the base scope and drops optional extras", () => {
    const items = [
      line({ description: "sheets" }),
      line({ description: "gutter guard", is_optional: true }),
    ];
    assert.deepEqual(
      defaultScope(items).map((i) => i.description),
      ["sheets"],
    );
  });

  test("offers the cheapest tier, not all of them", () => {
    // "Cheapest" is a presentation order, not a price comparison: good < better
    // < best. Including two tiers would double-count the same work.
    const items = [
      line({ description: "base" }),
      line({ description: "better sheets", tier: "better" }),
      line({ description: "best sheets", tier: "best" }),
    ];
    assert.deepEqual(
      defaultScope(items).map((i) => i.description),
      ["base", "better sheets"],
    );
  });

  test("an optional line carrying a tier is still excluded", () => {
    const items = [line({ description: "whirlybirds", is_optional: true, tier: "good" })];
    assert.deepEqual(defaultScope(items), []);
  });

  test("no lines at all is not an error", () => {
    assert.deepEqual(defaultScope([]), []);
  });
});

describe("quoteTotalCents", () => {
  const quote = (over: Partial<Quote> = {}) =>
    ({
      margin_pct: 20,
      gst_enabled: false,
      gst_rate: 10,
      show_breakdown: true,
      total_cents: null,
      accepted_total_cents: null,
      ...over,
    }) as Quote;

  const items = [
    { kind: "material" as const, qty: 2, unit_cost_cents: 10_000, is_optional: false, tier: null },
  ];

  test("a draft is priced live from its own line items", () => {
    // 2 × $100 cost, +20% margin = $240.
    assert.equal(quoteTotalCents(quote(), items), 24_000);
  });

  test("an issued quote uses its frozen total, never a recompute", () => {
    // Recomputing history would silently reprice a sent document the day the
    // price book moved.
    assert.equal(quoteTotalCents(quote({ total_cents: 19_900 }), items), 19_900);
  });

  test("what the client accepted outranks what was quoted", () => {
    assert.equal(
      quoteTotalCents(quote({ total_cents: 19_900, accepted_total_cents: 27_500 }), items),
      27_500,
    );
  });

  test("a quote with no lines is worth nothing, not NaN", () => {
    const value = quoteTotalCents(quote(), []);
    assert.equal(value, 0);
    assert.ok(Number.isInteger(value));
  });

  test("a malformed quantity contributes zero rather than poisoning the total", () => {
    const bad = [
      { kind: "material" as const, qty: Number.NaN, unit_cost_cents: 5_000, is_optional: false, tier: null },
    ];
    assert.equal(quoteTotalCents(quote(), bad), 0);
  });
});

describe("scopeFromQuoteItems", () => {
  test("carries the id through, so a client's selection can name a line", () => {
    const stored = [
      {
        id: "item-1",
        quote_id: "q1",
        kind: "labour",
        description: "Install",
        qty: 8,
        unit: "hr",
        unit_cost_cents: 9_000,
        is_optional: true,
        tier: "best",
        sort: 0,
      },
    ] as QuoteItem[];

    assert.deepEqual(scopeFromQuoteItems(stored), [
      {
        id: "item-1",
        kind: "labour",
        description: "Install",
        qty: 8,
        unit: "hr",
        unit_cost_cents: 9_000,
        is_optional: true,
        tier: "best",
      },
    ]);
  });
});

describe("labels and filenames", () => {
  test("a quote without a number is a draft, and says so", () => {
    assert.equal(quoteLabel({ quote_number: null }), "DRAFT");
    assert.equal(pdfFilename({ quote_number: null }), "DRAFT.pdf");
  });

  test("an issued quote is filed under its number", () => {
    assert.equal(pdfFilename({ quote_number: "Q-2026-0008" }), "Q-2026-0008.pdf");
  });

  test("a number carrying path or quote characters cannot break the header", () => {
    // Content-Disposition is a quoted header; an unescaped quote or slash there
    // is a response-splitting shaped problem, not a cosmetic one.
    assert.equal(pdfFilename({ quote_number: 'Q/2026"0008' }), "Q-2026-0008.pdf");
  });
});
