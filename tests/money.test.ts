import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  money,
  moneyShort,
  lineTotalCents,
  computeTotals,
  computeDisplayTotals,
  displayUnitCents,
  depositCents,
  isBelowMarginFloor,
  type CalcItem,
} from "../src/lib/money.ts";

/**
 * The reference figures come from the prototype's seeded quote Q-2026-0007
 * (design-reference/quoting-tool/app/data.js): 8 lines, 22% margin, GST off.
 * The rendered PDF shows Total $30,529.28 and Margin $5,505.28 on a subtotal
 * of $25,024.00 — verified in the browser during the design import.
 */
const Q7_ITEMS: CalcItem[] = [
  { kind: "material", qty: 188, unit_cost_cents: 4200 },
  { kind: "material", qty: 188, unit_cost_cents: 1350 },
  { kind: "material", qty: 240, unit_cost_cents: 850 },
  { kind: "material", qty: 1, unit_cost_cents: 142000 },
  { kind: "material", qty: 1, unit_cost_cents: 68000 },
  { kind: "labour", qty: 24, unit_cost_cents: 9500 },
  { kind: "labour", qty: 56, unit_cost_cents: 9500 },
  { kind: "labour", qty: 1, unit_cost_cents: 285000 },
];

describe("formatting", () => {
  test("money is AUD with two decimals", () => {
    assert.equal(money(3052928), "$30,529.28");
    assert.equal(money(0), "$0.00");
    assert.equal(money(5), "$0.05");
  });

  test("moneyShort drops .00 on whole dollars", () => {
    assert.equal(moneyShort(400000), "$4,000");
    assert.equal(moneyShort(429992), "$4,299.92");
  });

  test("negative amounts format sensibly", () => {
    // The prototype rendered "$-123.45"; the sign belongs before the symbol.
    assert.equal(money(-12345), "-$123.45");
    assert.equal(moneyShort(-400000), "-$4,000");
  });
});

describe("lineTotalCents", () => {
  test("multiplies quantity by unit cost and rounds once", () => {
    assert.equal(lineTotalCents({ kind: "material", qty: 188, unit_cost_cents: 4200 }), 789600);
    assert.equal(lineTotalCents({ kind: "labour", qty: 1, unit_cost_cents: 285000 }), 285000);
  });

  test("a half cent rounds rather than truncating", () => {
    assert.equal(lineTotalCents({ kind: "material", qty: 1.5, unit_cost_cents: 101 }), 152);
  });

  test("missing or malformed quantity yields zero, never NaN", () => {
    assert.equal(lineTotalCents({ kind: "material", qty: "", unit_cost_cents: 4200 }), 0);
    assert.equal(lineTotalCents({ kind: "material", qty: "x", unit_cost_cents: 4200 }), 0);
  });
});

describe("computeTotals — matches the prototype", () => {
  test("happy path: Q-2026-0007 reproduces the rendered figures", () => {
    const t = computeTotals({ margin_pct: 22 }, Q7_ITEMS);
    assert.equal(t.matCents, 1457400, "materials at cost");
    assert.equal(t.labCents, 1045000, "labour at cost");
    assert.equal(t.subtotal, 2502400, "$25,024.00");
    assert.equal(t.margin, 550528, "$5,505.28");
    assert.equal(t.total, 3052928, "$30,529.28");
    assert.equal(money(t.total), "$30,529.28");
  });

  test("margin is never printed — it lives only in the internal totals", () => {
    const t = computeTotals({ margin_pct: 22 }, Q7_ITEMS);
    const d = computeDisplayTotals({ margin_pct: 22, show_breakdown: true }, Q7_ITEMS);
    assert.ok(!Object.keys(d).includes("margin"), "display totals must not expose margin");
    assert.ok(t.margin > 0);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  test("edge: zero margin means price equals cost", () => {
    const t = computeTotals({ margin_pct: 0 }, Q7_ITEMS);
    assert.equal(t.margin, 0);
    assert.equal(t.total, t.subtotal);
  });

  test("edge: no line items totals to zero, not NaN", () => {
    const t = computeTotals({ margin_pct: 22 }, []);
    assert.deepEqual(t, {
      matCents: 0, labCents: 0, subtotal: 0, margin: 0, preGst: 0, gst: 0, total: 0,
    });
  });

  test("edge: GST off adds nothing", () => {
    const t = computeTotals({ margin_pct: 20, gst_enabled: false }, Q7_ITEMS);
    assert.equal(t.gst, 0);
    assert.equal(t.total, t.preGst);
  });

  test("edge: GST on adds the configured rate, not a hardcoded 10%", () => {
    const ten = computeTotals({ margin_pct: 20, gst_enabled: true, gst_rate: 10 }, Q7_ITEMS);
    assert.equal(ten.gst, Math.round(ten.preGst * 0.1));

    const fifteen = computeTotals({ margin_pct: 20, gst_enabled: true, gst_rate: 15 }, Q7_ITEMS);
    assert.equal(fifteen.gst, Math.round(fifteen.preGst * 0.15));
    assert.notEqual(ten.gst, fifteen.gst, "rate must be configurable");
  });

  test("edge: fractional quantities round to whole cents once", () => {
    const t = computeTotals({ margin_pct: 0 }, [
      { kind: "material", qty: 0.333, unit_cost_cents: 100 },
    ]);
    assert.equal(t.subtotal, 33);
    assert.ok(Number.isInteger(t.subtotal), "cents must stay integral");
  });

  // ── Failure / malformed input ─────────────────────────────────────────────

  test("failure: non-numeric margin is treated as zero, not NaN", () => {
    const t = computeTotals({ margin_pct: "not a number" }, Q7_ITEMS);
    assert.equal(t.margin, 0);
    assert.ok(Number.isFinite(t.total));
  });

  test("failure: non-numeric qty contributes zero rather than poisoning the total", () => {
    const t = computeTotals({ margin_pct: 20 }, [
      { kind: "material", qty: "abc", unit_cost_cents: 4200 },
      { kind: "material", qty: 10, unit_cost_cents: 100 },
    ]);
    assert.equal(t.subtotal, 1000);
    assert.ok(Number.isFinite(t.total));
  });

  test("failure: string margin from a form input still computes", () => {
    const typed = computeTotals({ margin_pct: "22" }, Q7_ITEMS);
    const numeric = computeTotals({ margin_pct: 22 }, Q7_ITEMS);
    assert.deepEqual(typed, numeric);
  });
});

describe("client-facing display totals", () => {
  test("printed lines sum exactly to the printed total", () => {
    const quote = { margin_pct: 22, show_breakdown: true };
    const d = computeDisplayTotals(quote, Q7_ITEMS);
    const summed = Q7_ITEMS.reduce(
      (s, i) => s + Math.round(displayUnitCents(i, 22) * Number(i.qty)),
      0,
    );
    assert.equal(
      d.subtotal, summed,
      "a client adding up the column must reach the printed subtotal",
    );
    assert.equal(d.total, d.subtotal + d.gst);
  });

  test("unit prices are marked up, so cost is never disclosed", () => {
    const item = Q7_ITEMS[0];
    const shown = displayUnitCents(item, 22);
    assert.equal(shown, 5124, "$42.00 cost at 22% → $51.24");
    assert.notEqual(shown, item.unit_cost_cents);
  });

  test("with the breakdown hidden, the single figure is the marked-up price", () => {
    const t = computeTotals({ margin_pct: 22 }, Q7_ITEMS);
    const d = computeDisplayTotals({ margin_pct: 22, show_breakdown: false }, Q7_ITEMS);
    assert.equal(d.subtotal, t.preGst);
  });

  test("displayed and internal totals may differ by rounding, but only slightly", () => {
    const t = computeTotals({ margin_pct: 22 }, Q7_ITEMS);
    const d = computeDisplayTotals({ margin_pct: 22, show_breakdown: true }, Q7_ITEMS);
    assert.ok(
      Math.abs(d.subtotal - t.preGst) <= Q7_ITEMS.length,
      `rounding drift ${d.subtotal - t.preGst}c should be at most one cent per line`,
    );
  });
});

describe("deposit and margin floor", () => {
  test("deposit is a percentage of the client-facing total", () => {
    assert.equal(depositCents(3052928, 10), 305293);
    assert.equal(depositCents(3052928, 0), 0);
  });

  test("margin floor flags a quote priced below the configured minimum", () => {
    assert.equal(isBelowMarginFloor(12, 15), true);
    assert.equal(isBelowMarginFloor(15, 15), false, "equal to the floor is not below it");
    assert.equal(isBelowMarginFloor(22, 15), false);
  });

  test("the floor guards margin, not cost freshness", () => {
    // A 20% margin on a cost that rose 12% is not a 20% margin. The floor
    // cannot see that — price_book.cost_updated_at is what catches it.
    assert.equal(isBelowMarginFloor(20, 15), false);
  });
});
