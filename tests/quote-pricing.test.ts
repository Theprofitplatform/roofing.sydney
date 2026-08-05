import { register } from "node:module";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ScopeItem } from "../src/lib/quote-pricing.ts";
import type { CalcQuote } from "../src/lib/money.ts";

/**
 * `quote-pricing` imports `./money` with no file extension. Next's bundler
 * resolves that; node resolves specifiers literally and would not find it. The
 * PDF suite's hook fills the extension in, so the module under test loads here
 * exactly as it will in the build. Registering it forces the imports below to
 * be dynamic — a static import would be hoisted above this line.
 */
register("./tsx-loader.mjs", import.meta.url);

const {
  offeredTiers,
  hasTiers,
  optionalExtras,
  baseScope,
  defaultSelection,
  resolveScope,
  priceSelection,
  extraDelta,
  tierPrices,
  validateSelection,
} = await import("../src/lib/quote-pricing.ts");
const { computeTotals, displayAmountCents } = await import("../src/lib/money.ts");

const item = (over: Partial<ScopeItem> & Pick<ScopeItem, "id">): ScopeItem => ({
  kind: "material",
  description: over.id,
  qty: 1,
  unit: "ea",
  unit_cost_cents: 0,
  is_optional: false,
  tier: null,
  ...over,
});

/**
 * One quote carrying all three kinds of line, with round costs so every expected
 * figure below can be checked on a calculator rather than copied from a run.
 *
 *   base scope   100m² sheeting @ $40.00 = $4,000.00
 *                20h strip and dispose @ $90.00 = $1,800.00   → $5,800.00
 *   tiers        good $500.00 · better $900.00 · best $1,800.00
 *   extras       gutters $1,000.00 · whirlybirds $360.00
 *                ridge vent $600.00, which belongs to Best only
 */
const ITEMS: ScopeItem[] = [
  item({ id: "base-sheet", description: "Colorbond sheeting", qty: 100, unit: "m2", unit_cost_cents: 4000 }),
  item({ id: "base-strip", description: "Strip and dispose", kind: "labour", qty: 20, unit: "hr", unit_cost_cents: 9000 }),
  item({ id: "tier-good", description: "Standard sarking", qty: 100, unit: "m2", unit_cost_cents: 500, tier: "good" }),
  item({ id: "tier-better", description: "Foil-backed sarking", qty: 100, unit: "m2", unit_cost_cents: 900, tier: "better" }),
  item({ id: "tier-best", description: "Insulated blanket", qty: 100, unit: "m2", unit_cost_cents: 1800, tier: "best" }),
  item({ id: "extra-gutters", description: "Replace gutters", qty: 40, unit: "m", unit_cost_cents: 2500, is_optional: true }),
  item({ id: "extra-whirly", description: "Whirlybirds", qty: 2, unit_cost_cents: 18000, is_optional: true }),
  item({ id: "extra-vent", description: "Ridge vent", unit_cost_cents: 60000, is_optional: true, tier: "best" }),
];

const QUOTE: CalcQuote = {
  margin_pct: 25,
  gst_enabled: true,
  gst_rate: 10,
  show_breakdown: true,
};

const ids = (items: readonly ScopeItem[]): string[] => items.map((i) => i.id);

describe("scope shape", () => {
  test("offeredTiers lists the tiers present, in good → better → best order", () => {
    assert.deepEqual(offeredTiers(ITEMS), ["good", "better", "best"]);
    assert.equal(hasTiers(ITEMS), true);
  });

  test("presentation order comes from the tier ladder, not the authoring order", () => {
    const shuffled = [ITEMS[4], ITEMS[0], ITEMS[2]]; // best, base, good
    assert.deepEqual(offeredTiers(shuffled), ["good", "best"]);
  });

  test("a quote with no tier lines offers none", () => {
    const flat = ITEMS.filter((i) => i.tier === null);
    assert.deepEqual(offeredTiers(flat), []);
    assert.equal(hasTiers(flat), false);
  });

  test("optional extras keep their authored order; base scope excludes them", () => {
    assert.deepEqual(ids(optionalExtras(ITEMS)), ["extra-gutters", "extra-whirly", "extra-vent"]);
    assert.deepEqual(ids(baseScope(ITEMS)), ["base-sheet", "base-strip"]);
  });
});

describe("defaultSelection", () => {
  test("opens on the cheapest offered tier with nothing ticked", () => {
    // Starting on the dearest option reads as a sales trick; the client should
    // be the one who talks themselves up.
    assert.deepEqual(defaultSelection(ITEMS), { tier: "good", optionalIds: [] });
  });

  test("cheapest means cheapest offered, not cheapest possible", () => {
    const noGood = ITEMS.filter((i) => i.tier !== "good");
    assert.deepEqual(defaultSelection(noGood), { tier: "better", optionalIds: [] });
  });

  test("edge: a quote without tiers defaults to no tier at all", () => {
    assert.deepEqual(defaultSelection(baseScope(ITEMS)), { tier: null, optionalIds: [] });
    assert.deepEqual(defaultSelection([]), { tier: null, optionalIds: [] });
  });
});

describe("resolveScope", () => {
  test("base scope is in every version of the quote", () => {
    for (const tier of ["good", "better", "best"] as const) {
      const scope = ids(resolveScope(ITEMS, { tier }));
      assert.ok(scope.includes("base-sheet"));
      assert.ok(scope.includes("base-strip"));
    }
  });

  test("a tier line is in for its own tier and out for the others", () => {
    assert.deepEqual(ids(resolveScope(ITEMS, { tier: "better" })), [
      "base-sheet",
      "base-strip",
      "tier-better",
    ]);
    assert.deepEqual(ids(resolveScope(ITEMS, { tier: "best" })), [
      "base-sheet",
      "base-strip",
      "tier-best",
    ]);
  });

  test("an optional line is only in once its id has been selected", () => {
    assert.deepEqual(ids(resolveScope(ITEMS, { tier: "good" })), [
      "base-sheet",
      "base-strip",
      "tier-good",
    ]);
    assert.deepEqual(ids(resolveScope(ITEMS, { tier: "good", optionalIds: ["extra-whirly"] })), [
      "base-sheet",
      "base-strip",
      "tier-good",
      "extra-whirly",
    ]);
  });

  test("a tiered extra cannot be smuggled into a different tier", () => {
    // extra-vent is a Best-only upgrade. Ticking it under Good must not add it,
    // or the client is billed for something the quote never offered them.
    const wrongTier = resolveScope(ITEMS, { tier: "good", optionalIds: ["extra-vent"] });
    assert.equal(ids(wrongTier).includes("extra-vent"), false);

    const rightTier = resolveScope(ITEMS, { tier: "best", optionalIds: ["extra-vent"] });
    assert.equal(ids(rightTier).includes("extra-vent"), true);
  });

  test("edge: no selection at all resolves to base scope only", () => {
    assert.deepEqual(ids(resolveScope(ITEMS)), ["base-sheet", "base-strip"]);
    assert.deepEqual(ids(resolveScope(ITEMS, {})), ["base-sheet", "base-strip"]);
  });

  test("edge: no items resolves to nothing rather than throwing", () => {
    assert.deepEqual(resolveScope([], { tier: "good", optionalIds: ["nope"] }), []);
  });
});

describe("priceSelection", () => {
  test("happy path: Good tier prices cost, margin and GST as expected", () => {
    const p = priceSelection(QUOTE, ITEMS, { tier: "good" });
    assert.equal(p.matCents, 450_000, "$4,000 sheeting + $500 sarking");
    assert.equal(p.labCents, 180_000, "$1,800 labour");
    assert.equal(p.subtotal, 630_000, "cost, internal only");
    assert.equal(p.margin, 157_500, "25% of cost");
    assert.equal(p.preGst, 787_500);
    assert.equal(p.gst, 78_750);
    assert.equal(p.total, 866_250);
    assert.deepEqual(ids(p.items), ["base-sheet", "base-strip", "tier-good"]);
  });

  test("the client-facing figures match the internal ones on clean costs", () => {
    const p = priceSelection(QUOTE, ITEMS, { tier: "good" });
    assert.deepEqual(p.display, { subtotal: 787_500, gst: 78_750, total: 866_250 });
  });

  test("moving up a tier moves the price up", () => {
    const good = priceSelection(QUOTE, ITEMS, { tier: "good" });
    const better = priceSelection(QUOTE, ITEMS, { tier: "better" });
    const best = priceSelection(QUOTE, ITEMS, { tier: "best" });

    assert.equal(better.display.total, 921_250);
    assert.equal(best.display.total, 1_045_000);
    assert.ok(good.display.total < better.display.total);
    assert.ok(better.display.total < best.display.total);
  });

  test("ticking an extra moves the price up by that extra, marked up and taxed", () => {
    const plain = priceSelection(QUOTE, ITEMS, { tier: "good" });
    const withGutters = priceSelection(QUOTE, ITEMS, {
      tier: "good",
      optionalIds: ["extra-gutters"],
    });
    assert.equal(withGutters.subtotal - plain.subtotal, 100_000, "gutters at cost");
    assert.equal(
      withGutters.display.total - plain.display.total,
      137_500,
      "$1,000 cost → $1,250 + 10% GST",
    );
  });

  test("edge: a quote with no items prices to zero, not NaN", () => {
    const p = priceSelection(QUOTE, [], { tier: "good" });
    assert.equal(p.subtotal, 0);
    assert.equal(p.total, 0);
    assert.deepEqual(p.display, { subtotal: 0, gst: 0, total: 0 });
    assert.deepEqual(p.items, []);
  });

  test("edge: a quote of nothing but extras costs nothing until one is ticked", () => {
    const extrasOnly = optionalExtras(ITEMS).filter((i) => i.tier === null);
    assert.deepEqual(baseScope(extrasOnly), []);
    assert.equal(priceSelection(QUOTE, extrasOnly).display.total, 0);
    assert.equal(
      priceSelection(QUOTE, extrasOnly, { optionalIds: ["extra-whirly"] }).display.total,
      49_500,
      "$360 cost → $450 + 10% GST",
    );
  });
});

/**
 * Rounding bites when a marked-up unit price is not a whole number of cents.
 * $3.33 and $11.11 at 22% are the smallest honest example: the displayed lines
 * come to $107.03 while margin taken over the whole subtotal gives $107.07.
 */
const ROUNDY: ScopeItem[] = [
  item({ id: "r-mat", qty: 3, unit_cost_cents: 333 }),
  item({ id: "r-lab", kind: "labour", qty: 7, unit_cost_cents: 1111 }),
];

describe("priceSelection — the printed column must add up", () => {
  const shown: CalcQuote = { margin_pct: 22, gst_enabled: false, show_breakdown: true };

  test("display.subtotal is the sum of the marked-up line amounts", () => {
    const p = priceSelection(shown, ROUNDY);
    const summed = p.items.reduce((s, i) => s + displayAmountCents(i, shown.margin_pct), 0);
    assert.equal(summed, 10_703, "$12.18 + $94.85");
    assert.equal(
      p.display.subtotal,
      summed,
      "a client adding up the column must reach the printed total",
    );
    assert.equal(p.display.total, 10_703);
  });

  test("which is not the same as marking the subtotal up once — and that is deliberate", () => {
    const p = priceSelection(shown, ROUNDY);
    assert.equal(p.preGst, 10_707, "internal price rounds the margin once");
    assert.notEqual(p.display.subtotal, p.preGst);
  });

  test("with the breakdown hidden the single printed figure is the internal price", () => {
    const hidden: CalcQuote = { ...shown, show_breakdown: false };
    const p = priceSelection(hidden, ROUNDY);
    assert.equal(p.display.subtotal, p.preGst);
    assert.equal(p.display.subtotal, 10_707);
  });
});

describe("extraDelta", () => {
  test("equals the change in the client-facing total", () => {
    const selection = { tier: "good" as const, optionalIds: [] };
    const before = priceSelection(QUOTE, ITEMS, selection).display.total;
    const after = priceSelection(QUOTE, ITEMS, {
      ...selection,
      optionalIds: ["extra-gutters"],
    }).display.total;

    assert.equal(extraDelta(QUOTE, ITEMS, selection, "extra-gutters"), after - before);
    assert.equal(extraDelta(QUOTE, ITEMS, selection, "extra-gutters"), 137_500);
  });

  test("is measured against the current selection, not an empty one", () => {
    // With one extra already ticked the answer must still be "what does adding
    // this one do to my total", computed from where the client actually is.
    const selection = { tier: "good" as const, optionalIds: ["extra-whirly"] };
    const before = priceSelection(QUOTE, ITEMS, selection).display.total;
    const after = priceSelection(QUOTE, ITEMS, {
      ...selection,
      optionalIds: ["extra-whirly", "extra-gutters"],
    }).display.total;

    assert.equal(before, 915_750);
    assert.equal(after, 1_053_250);
    assert.equal(extraDelta(QUOTE, ITEMS, selection, "extra-gutters"), 137_500);
    assert.equal(extraDelta(QUOTE, ITEMS, selection, "extra-gutters"), after - before);
  });

  test("an already-ticked extra reports what it is costing, not zero", () => {
    const selection = { tier: "good" as const, optionalIds: ["extra-gutters"] };
    assert.equal(extraDelta(QUOTE, ITEMS, selection, "extra-gutters"), 137_500);
  });

  test("the current tier decides whether a tiered extra can add anything at all", () => {
    const good = { tier: "good" as const, optionalIds: [] };
    const best = { tier: "best" as const, optionalIds: [] };
    assert.equal(extraDelta(QUOTE, ITEMS, good, "extra-vent"), 0, "not on offer under Good");
    assert.equal(extraDelta(QUOTE, ITEMS, best, "extra-vent"), 82_500, "$600 → $750 + 10% GST");
  });

  test("failure: an unknown id adds nothing rather than throwing", () => {
    assert.equal(extraDelta(QUOTE, ITEMS, { tier: "good" }, "no-such-line"), 0);
  });
});

describe("tierPrices", () => {
  test("one row per offered tier, in ladder order, at client-facing prices", () => {
    assert.deepEqual(tierPrices(QUOTE, ITEMS), [
      { tier: "good", total: 866_250 },
      { tier: "better", total: 921_250 },
      { tier: "best", total: 1_045_000 },
    ]);
  });

  test("the comparison row keeps the client's ticked extras in every column", () => {
    const rows = tierPrices(QUOTE, ITEMS, ["extra-whirly"]);
    assert.deepEqual(
      rows.map((r) => r.tier),
      ["good", "better", "best"],
    );
    for (const row of rows) {
      const plain = priceSelection(QUOTE, ITEMS, { tier: row.tier }).display.total;
      assert.equal(row.total - plain, 49_500, `${row.tier} must include the whirlybirds`);
    }
  });

  test("edge: a quote without tiers has no comparison row", () => {
    assert.deepEqual(tierPrices(QUOTE, baseScope(ITEMS)), []);
  });
});

describe("validateSelection", () => {
  test("happy path: a valid tier with a real extra is accepted", () => {
    assert.deepEqual(
      validateSelection(ITEMS, { tier: "good", optionalIds: ["extra-gutters"] }),
      { ok: true },
    );
  });

  test("failure: an id that is not on this quote is rejected", () => {
    assert.deepEqual(validateSelection(ITEMS, { tier: "good", optionalIds: ["ghost"] }), {
      ok: false,
      reason: "An optional extra on this quote no longer exists.",
    });
  });

  test("failure: a base-scope line submitted as an extra is rejected", () => {
    assert.deepEqual(validateSelection(ITEMS, { tier: "good", optionalIds: ["base-sheet"] }), {
      ok: false,
      reason: "That line is part of the base scope, not an extra.",
    });
  });

  test("failure: a quote that offers tiers requires one to be chosen", () => {
    assert.deepEqual(validateSelection(ITEMS, {}), {
      ok: false,
      reason: "Choose one of the options before accepting.",
    });
    assert.deepEqual(validateSelection(ITEMS, { tier: null }), {
      ok: false,
      reason: "Choose one of the options before accepting.",
    });
  });

  test("failure: a tier the quote does not offer is rejected", () => {
    const noBest = ITEMS.filter((i) => i.tier !== "best");
    assert.deepEqual(validateSelection(noBest, { tier: "best" }), {
      ok: false,
      reason: "Choose one of the options before accepting.",
    });
  });

  test("failure: a tier submitted against a quote with no options is rejected", () => {
    assert.deepEqual(validateSelection(baseScope(ITEMS), { tier: "good" }), {
      ok: false,
      reason: "This quote does not offer options.",
    });
  });

  test("edge: a tier-less quote accepts an empty or explicitly null selection", () => {
    const flat = ITEMS.filter((i) => i.tier === null);
    assert.deepEqual(validateSelection(flat, {}), { ok: true });
    assert.deepEqual(validateSelection(flat, { tier: null, optionalIds: [] }), { ok: true });
    assert.deepEqual(validateSelection([], {}), { ok: true });
  });

  test("a tiered extra passes validation, and the tier decides whether it prices", () => {
    // Validation only asks "is this an extra on this quote". Whether it is in
    // scope is resolveScope's job, and it already refuses the wrong tier.
    assert.deepEqual(validateSelection(ITEMS, { tier: "good", optionalIds: ["extra-vent"] }), {
      ok: true,
    });
    assert.equal(
      priceSelection(QUOTE, ITEMS, { tier: "good", optionalIds: ["extra-vent"] }).display.total,
      priceSelection(QUOTE, ITEMS, { tier: "good" }).display.total,
    );
  });
});

describe("cost never reaches the client", () => {
  test("the displayed total always exceeds cost by the configured margin", () => {
    const p = priceSelection(QUOTE, ITEMS, { tier: "best", optionalIds: ["extra-gutters"] });
    const internal = computeTotals(QUOTE, p.items);
    assert.equal(p.subtotal, internal.subtotal);
    assert.ok(p.display.total > p.subtotal, "the client pays cost plus margin plus GST");
    assert.equal(p.margin, Math.round((p.subtotal * 25) / 100));
  });

  test("the client-facing display object exposes no cost or margin field", () => {
    const p = priceSelection(QUOTE, ITEMS, { tier: "good" });
    assert.deepEqual(Object.keys(p.display).sort(), ["gst", "subtotal", "total"]);
  });
});
