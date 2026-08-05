import { register } from "node:module";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ReportQuote } from "../src/lib/reports.ts";

/**
 * `reports` imports `./money` with no file extension — the bundler resolves it,
 * node does not. Same hook and same dynamic-import dance as reports.test.ts; a
 * static import would hoist above the register() call and defeat it.
 */
register("./tsx-loader.mjs", import.meta.url);

const { achievedMargin, marginSummary, quoteValueCents } = await import(
  "../src/lib/reports.ts"
);

/** Same shape as the fixture in reports.test.ts, kept local so each file reads alone. */
function reportQuote(
  quote: Partial<ReportQuote["quote"]> = {},
  items: { id: string; kind: "material" | "labour"; qty: number; unit_cost_cents: number; tier: "good" | "better" | "best" | null; is_optional?: boolean }[] = [],
  selectedItemIds: string[] = [],
): ReportQuote {
  return {
    quote: {
      id: "q",
      status: "draft",
      roof_type: null,
      margin_pct: 20,
      gst_enabled: false,
      gst_rate: 10,
      show_breakdown: true,
      created_at: "2026-03-10T12:00:00.000Z",
      sent_at: null,
      accepted_at: null,
      total_cents: null,
      accepted_total_cents: null,
      ...quote,
    },
    items: items.map((i) => ({ is_optional: false, ...i })),
    selectedItemIds,
  };
}

/**
 * Regression: tiered and optional lines must be resolved to a real scope before
 * anything is costed.
 *
 * A quote's `quote_items` can hold three good/better/best variants and any number
 * of client-selectable extras alongside the base scope. Costing that raw list
 * sums a job nobody was ever offered. It shipped that way once, and the effect on
 * the headline KPI was not subtle: a healthy 25% reported as roughly 1.5%,
 * because two unsold tiers and an unticked extra were all counted as cost.
 */
describe("scope resolution before costing", () => {
  // Base $100 + one of {good $50, better $150, best $250} + optional extra $80.
  const TIERED = [
    { id: "base", kind: "material" as const, qty: 1, unit_cost_cents: 10_000, tier: null },
    { id: "g", kind: "material" as const, qty: 1, unit_cost_cents: 5_000, tier: "good" as const },
    { id: "b", kind: "material" as const, qty: 1, unit_cost_cents: 15_000, tier: "better" as const },
    { id: "x", kind: "material" as const, qty: 1, unit_cost_cents: 25_000, tier: "best" as const },
    { id: "e", kind: "material" as const, qty: 1, unit_cost_cents: 8_000, tier: null, is_optional: true },
  ];

  test("an accepted quote costs the tier and extras the client actually chose", () => {
    // Accepted on `best` with the extra: $100 + $250 + $80 = $430 of cost, sold
    // at $537.50 — exactly 25% on cost.
    const row = reportQuote(
      {
        status: "accepted",
        margin_pct: 25,
        accepted_total_cents: 53_750,
        selected_tier: "best",
      },
      TIERED,
      ["e"],
    );

    const { cents, pct } = achievedMargin(row);
    assert.equal(cents, 53_750 - 43_000);
    assert.ok(Math.abs(pct - 25) < 0.01, `expected ~25%, got ${pct.toFixed(2)}%`);
  });

  test("summing every tier at once is what made 25% read as noise", () => {
    // The defect: cost as if base + good + better + best + extra = $630 were all
    // sold, against the same $537.50 receipt.
    const row = reportQuote(
      { status: "accepted", margin_pct: 25, accepted_total_cents: 53_750, selected_tier: "best" },
      TIERED,
      ["e"],
    );
    const naiveCost = TIERED.reduce((sum, i) => sum + i.unit_cost_cents, 0);
    const naivePct = ((53_750 - naiveCost) / naiveCost) * 100;

    assert.ok(naivePct < 2, "fixture must reproduce the old wrong answer");
    assert.ok(naivePct < 0, "summing every tier turns a real profit into a loss");
    assert.ok(
      achievedMargin(row).pct > 20,
      "resolved scope must not reproduce the unresolved figure",
    );
  });

  test("an unaccepted quote costs the default scope — cheapest tier, no extras", () => {
    // What the portal opens on, and therefore what was frozen at issue:
    // base $100 + good $50 = $150 of cost.
    const row = reportQuote({ status: "sent", margin_pct: 20, total_cents: 18_000 }, TIERED);
    assert.equal(achievedMargin(row).cents, 18_000 - 15_000);
  });

  test("marginSummary weights by resolved cost, not by the raw line total", () => {
    const row = reportQuote(
      { status: "accepted", margin_pct: 25, accepted_total_cents: 53_750, selected_tier: "best" },
      TIERED,
      ["e"],
    );
    const summary = marginSummary([row]);
    assert.ok(
      Math.abs(summary.achievedPct - 25) < 0.01,
      `expected ~25%, got ${summary.achievedPct.toFixed(2)}%`,
    );
  });

  test("a draft with no frozen total prices its default scope, not every tier", () => {
    // $150 of cost at 20% = $180, never the $630-of-everything figure.
    const row = reportQuote({ status: "draft", margin_pct: 20 }, TIERED);
    assert.equal(quoteValueCents(row), 18_000);
  });
});
