import { register } from "node:module";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { ReportQuote } from "../src/lib/reports.ts";
import type { CalcItem } from "../src/lib/money.ts";
import type { LostReason } from "../src/lib/db/types.ts";

/**
 * `reports` imports `./money` with no file extension. Next's bundler resolves
 * that; node resolves specifiers literally and would not find it. The PDF
 * suite's hook fills the extension in, so the module under test loads here
 * exactly as it will in the build. Registering it forces the imports below to
 * be dynamic — a static import would be hoisted above this line.
 */
register("./tsx-loader.mjs", import.meta.url);

const {
  quoteValueCents,
  achievedMargin,
  winRate,
  pipelineValue,
  byMonth,
  byJobType,
  bySource,
  marginSummary,
  lossReasons,
} = await import("../src/lib/reports.ts");
const { computeTotals } = await import("../src/lib/money.ts");

/**
 * Fixtures are deliberately tiny and round: three or four quotes with figures a
 * reader can add up, rather than a generated sample whose expected values could
 * only have come from a run of the code under test.
 *
 * Dates sit at midday on a mid-month day so `monthKey`, which reads them in
 * local time, lands in the same month in every timezone the office might run in.
 */
function reportQuote(
  quote: Partial<ReportQuote["quote"]> = {},
  items: (CalcItem & { id?: string; tier?: "good" | "better" | "best" | null })[] = [],
  source: string | null = null,
  selectedItemIds: string[] = [],
): ReportQuote {
  return {
    selectedItemIds,
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
    // Fixtures state only what a case is about; scope fields default to "plain
    // base-scope line" so an old fixture keeps meaning what it always meant.
    items: items.map((item, index) => ({
      is_optional: false,
      tier: null,
      ...item,
      id: item.id ?? `i${index}`,
    })),
    source,
  };
}

/** $100.00 of cost, which at the default 20% margin prices at $120.00. */
const ONE_HUNDRED_DOLLARS: CalcItem[] = [{ kind: "material", qty: 10, unit_cost_cents: 1000 }];

describe("quoteValueCents", () => {
  test("prefers what the client actually accepted", () => {
    const row = reportQuote(
      { status: "accepted", total_cents: 999_900, accepted_total_cents: 111_100 },
      ONE_HUNDRED_DOLLARS,
    );
    assert.equal(quoteValueCents(row), 111_100);
  });

  test("falls back to the figure frozen at issue", () => {
    const row = reportQuote({ status: "sent", total_cents: 500_000 }, ONE_HUNDRED_DOLLARS);
    assert.equal(quoteValueCents(row), 500_000);
  });

  test("only recomputes for a draft that has neither", () => {
    const row = reportQuote({ status: "draft" }, ONE_HUNDRED_DOLLARS);
    assert.equal(quoteValueCents(row), 12_000, "$100 cost at 20% margin, GST off");
  });

  test("an issued quote is never repriced, even when its items would cost more today", () => {
    // Silently repricing history is exactly what this ordering exists to
    // prevent: the price book moves, the quote the client holds does not.
    const row = reportQuote({ status: "sent", total_cents: 500_000 }, ONE_HUNDRED_DOLLARS);
    assert.equal(computeTotals(row.quote, row.items).total, 12_000, "today's price book");
    assert.equal(quoteValueCents(row), 500_000, "what was actually quoted");
  });

  test("edge: an accepted total of zero is honoured, not treated as missing", () => {
    const row = reportQuote(
      { status: "accepted", total_cents: 500_000, accepted_total_cents: 0 },
      ONE_HUNDRED_DOLLARS,
    );
    assert.equal(quoteValueCents(row), 0);
  });

  test("edge: a draft with no items is worth nothing rather than NaN", () => {
    assert.equal(quoteValueCents(reportQuote()), 0);
  });
});

describe("achievedMargin", () => {
  test("is what the client paid, less the cost that never moved", () => {
    const row = reportQuote(
      { status: "accepted", accepted_total_cents: 130_000 },
      [{ kind: "material", qty: 1, unit_cost_cents: 100_000 }],
    );
    assert.deepEqual(achievedMargin(row), { cents: 30_000, pct: 30 });
  });

  test("GST is excluded — it was never yours to keep", () => {
    const row = reportQuote(
      {
        status: "accepted",
        margin_pct: 25,
        gst_enabled: true,
        gst_rate: 10,
        accepted_total_cents: 137_500,
      },
      [{ kind: "material", qty: 1, unit_cost_cents: 100_000 }],
    );
    assert.deepEqual(achievedMargin(row), { cents: 25_000, pct: 25 });
  });

  test("a client who negotiated the price down shows the smaller margin banked", () => {
    const row = reportQuote(
      { status: "accepted", margin_pct: 30, accepted_total_cents: 110_000 },
      [{ kind: "material", qty: 1, unit_cost_cents: 100_000 }],
    );
    assert.equal(achievedMargin(row).pct, 10, "quoted 30%, banked 10%");
  });

  test("failure: selling under cost reports a negative margin rather than hiding it", () => {
    const row = reportQuote(
      { status: "accepted", accepted_total_cents: 80_000 },
      [{ kind: "material", qty: 1, unit_cost_cents: 100_000 }],
    );
    assert.deepEqual(achievedMargin(row), { cents: -20_000, pct: -20 });
  });

  test("edge: no cost means no percentage, not a division by zero", () => {
    const row = reportQuote({ status: "accepted", accepted_total_cents: 5_000 }, []);
    assert.deepEqual(achievedMargin(row), { cents: 5_000, pct: 0 });
  });
});

describe("winRate", () => {
  const ROWS: ReportQuote[] = [
    reportQuote({ id: "a", status: "accepted", accepted_total_cents: 500_000 }),
    reportQuote({ id: "b", status: "accepted", accepted_total_cents: 300_000 }),
    reportQuote({ id: "c", status: "declined", total_cents: 200_000 }),
    reportQuote({ id: "d", status: "expired", total_cents: 100_000 }),
    reportQuote({ id: "e", status: "sent", total_cents: 400_000 }),
    reportQuote({ id: "f", status: "viewed", total_cents: 600_000 }),
    reportQuote({ id: "g", status: "draft" }),
    reportQuote({ id: "h", status: "superseded", total_cents: 900_000 }),
  ];

  test("is a percentage of decided quotes, with the open book excluded", () => {
    const r = winRate(ROWS);
    assert.equal(r.won, 2);
    assert.equal(r.lost, 2, "declined and expired both count as lost");
    assert.equal(r.decided, 4);
    assert.equal(r.pct, 50);
  });

  test("open counts everything still live, superseded counts as nothing", () => {
    const r = winRate(ROWS);
    assert.equal(r.open, 3, "sent, viewed and draft");
    assert.equal(r.won + r.lost + r.open, ROWS.length - 1, "the superseded row is in no bucket");
  });

  test("edge: nothing decided gives zero, never NaN", () => {
    const r = winRate([reportQuote({ status: "sent" }), reportQuote({ status: "draft" })]);
    assert.equal(r.decided, 0);
    assert.equal(r.pct, 0);
    assert.equal(Number.isNaN(r.pct), false);
  });

  test("edge: no quotes at all is all zeros", () => {
    assert.deepEqual(winRate([]), { won: 0, lost: 0, decided: 0, open: 0, pct: 0 });
  });
});

describe("pipelineValue", () => {
  const ROWS: ReportQuote[] = [
    reportQuote({ status: "sent", total_cents: 10_000 }),
    reportQuote({ status: "viewed", total_cents: 10_000 }),
    reportQuote({ status: "sent", total_cents: 10_001 }),
    reportQuote({ status: "accepted", accepted_total_cents: 250_000 }),
    reportQuote({ status: "declined", total_cents: 70_000 }),
    reportQuote({ status: "draft" }, ONE_HUNDRED_DOLLARS),
    reportQuote({ status: "superseded", total_cents: 999_999 }),
  ];

  test("the open book is issued work only — drafts are counted separately", () => {
    const p = pipelineValue(ROWS);
    assert.deepEqual(p.open, { count: 3, totalCents: 30_001, averageCents: 10_000 });
    assert.deepEqual(p.drafts, { count: 1, totalCents: 12_000, averageCents: 12_000 });
  });

  test("won and lost buckets carry their own totals", () => {
    const p = pipelineValue(ROWS);
    assert.deepEqual(p.won, { count: 1, totalCents: 250_000, averageCents: 250_000 });
    assert.deepEqual(p.lost, { count: 1, totalCents: 70_000, averageCents: 70_000 });
  });

  test("averages land on whole cents — a third of a cent is not money", () => {
    const p = pipelineValue(ROWS);
    for (const bucket of [p.open, p.won, p.lost, p.drafts]) {
      assert.ok(Number.isInteger(bucket.averageCents), "cents must stay integral");
    }
    assert.equal(p.open.averageCents, Math.round(30_001 / 3));
  });

  test("edge: an empty bucket averages to zero rather than dividing by zero", () => {
    const p = pipelineValue([]);
    assert.deepEqual(p.open, { count: 0, totalCents: 0, averageCents: 0 });
    assert.deepEqual(p.won, { count: 0, totalCents: 0, averageCents: 0 });
  });
});

describe("byMonth", () => {
  const MARCH_SENT_MAY_WON = reportQuote({
    id: "lagged",
    status: "accepted",
    sent_at: "2026-03-15T12:00:00.000Z",
    accepted_at: "2026-05-20T12:00:00.000Z",
    accepted_total_cents: 500_000,
  });
  const MAY_SENT = reportQuote({
    id: "may",
    status: "sent",
    sent_at: "2026-05-10T12:00:00.000Z",
    total_cents: 300_000,
  });
  const NEVER_SENT = reportQuote({ id: "draft", status: "draft" }, ONE_HUNDRED_DOLLARS);

  test("a quote issued one month and won in a later one appears in both", () => {
    const buckets = byMonth([MARCH_SENT_MAY_WON, MAY_SENT, NEVER_SENT]);
    assert.deepEqual(
      buckets.map((b) => b.month),
      ["2026-03", "2026-05"],
    );

    const [march, may] = buckets;
    assert.equal(march.quoted.count, 1, "bucketed by issue date");
    assert.equal(march.quoted.totalCents, 500_000);
    assert.equal(march.won.count, 0, "not won in March");
    assert.equal(may.won.count, 1, "bucketed by acceptance date");
    assert.equal(may.won.totalCents, 500_000);
    assert.equal(may.quoted.totalCents, 300_000, "only the quote issued in May");
  });

  test("a draft that was never issued appears in no month", () => {
    const buckets = byMonth([NEVER_SENT]);
    assert.deepEqual(buckets, []);
  });

  test("months sort ascending so a chart reads left to right", () => {
    const buckets = byMonth([
      reportQuote({ status: "sent", sent_at: "2026-06-12T12:00:00.000Z", total_cents: 100 }),
      reportQuote({ status: "sent", sent_at: "2026-03-12T12:00:00.000Z", total_cents: 100 }),
      reportQuote({ status: "sent", sent_at: "2026-05-12T12:00:00.000Z", total_cents: 100 }),
    ]);
    assert.deepEqual(
      buckets.map((b) => b.month),
      ["2026-03", "2026-05", "2026-06"],
    );
  });

  test("the months limit keeps the most recent, not the first found", () => {
    const rows = [
      reportQuote({ status: "sent", sent_at: "2026-06-12T12:00:00.000Z", total_cents: 100 }),
      reportQuote({ status: "sent", sent_at: "2026-03-12T12:00:00.000Z", total_cents: 100 }),
      reportQuote({ status: "sent", sent_at: "2026-05-12T12:00:00.000Z", total_cents: 100 }),
    ];
    assert.deepEqual(
      byMonth(rows, 2).map((b) => b.month),
      ["2026-05", "2026-06"],
    );
    assert.deepEqual(
      byMonth(rows, 1).map((b) => b.month),
      ["2026-06"],
    );
  });
});

describe("byJobType and bySource", () => {
  const ROWS: ReportQuote[] = [
    reportQuote(
      { status: "accepted", roof_type: "Colorbond", accepted_total_cents: 500_000 },
      [],
      "Google",
    ),
    reportQuote({ status: "declined", roof_type: "Colorbond", total_cents: 400_000 }, [], "Google"),
    reportQuote(
      { status: "accepted", roof_type: "Tile", accepted_total_cents: 100_000 },
      [],
      "Referral",
    ),
    reportQuote({ status: "declined", roof_type: null, total_cents: 50_000 }, [], null),
    reportQuote({ status: "declined", roof_type: "   ", total_cents: 50_000 }, [], "  "),
  ];

  test("groups by job type and reports conversion within the slice", () => {
    const rows = byJobType(ROWS);
    const colorbond = rows.find((r) => r.key === "Colorbond");
    assert.deepEqual(colorbond, {
      key: "Colorbond",
      quoted: 2,
      won: 1,
      lost: 1,
      pct: 50,
      wonValueCents: 500_000,
    });
  });

  test("a missing or blank job type buckets as Unspecified", () => {
    const rows = byJobType(ROWS);
    const unspecified = rows.find((r) => r.key === "Unspecified");
    assert.equal(unspecified?.quoted, 2, "null and whitespace share the fallback bucket");
    assert.equal(unspecified?.wonValueCents, 0);
  });

  test("the slice that earns the most sits at the top", () => {
    assert.deepEqual(
      byJobType(ROWS).map((r) => r.key),
      ["Colorbond", "Tile", "Unspecified"],
    );
  });

  test("bySource groups the same way, with Unknown as its fallback", () => {
    const rows = bySource(ROWS);
    assert.deepEqual(
      rows.map((r) => r.key),
      ["Google", "Referral", "Unknown"],
    );
    assert.equal(rows[0].wonValueCents, 500_000);
    assert.equal(rows.find((r) => r.key === "Unknown")?.quoted, 2);
  });

  test("edge: no quotes produces no rows rather than an empty fallback bucket", () => {
    assert.deepEqual(byJobType([]), []);
    assert.deepEqual(bySource([]), []);
  });
});

describe("marginSummary", () => {
  /**
   * A 40% margin on $1,000 of cost and a 10% margin on $9,000 of cost. The naive
   * average says 25%; the money says 13%. Weighting by cost is the difference
   * between a report that pays wages and one that flatters you.
   */
  const SMALL_RICH = reportQuote(
    { status: "accepted", margin_pct: 40, accepted_total_cents: 140_000 },
    [{ kind: "material", qty: 1, unit_cost_cents: 100_000 }],
  );
  const BIG_THIN = reportQuote(
    { status: "accepted", margin_pct: 10, accepted_total_cents: 990_000 },
    [{ kind: "material", qty: 1, unit_cost_cents: 900_000 }],
  );

  test("achieved margin is cost-weighted, not a mean of percentages", () => {
    const m = marginSummary([SMALL_RICH, BIG_THIN]);
    assert.equal(m.achievedCents, 130_000, "$400 + $900 banked");
    assert.equal(m.achievedPct, 13, "$1,300 on $10,000 of cost");
    assert.equal(m.quotedPct, 25, "the straight average of what was quoted");
    assert.notEqual(m.achievedPct, m.quotedPct, "averaging the percentages would say 25%");
  });

  test("only won work counts — an open quote cannot flatter the average", () => {
    const open = reportQuote({ status: "sent", margin_pct: 90, total_cents: 999_999 }, [
      { kind: "material", qty: 1, unit_cost_cents: 100_000 },
    ]);
    assert.deepEqual(marginSummary([SMALL_RICH, BIG_THIN, open]), marginSummary([SMALL_RICH, BIG_THIN]));
  });

  test("edge: nothing won yet reports zeros rather than NaN", () => {
    assert.deepEqual(marginSummary([reportQuote({ status: "sent", total_cents: 100_000 })]), {
      quotedPct: 0,
      achievedPct: 0,
      achievedCents: 0,
    });
    assert.deepEqual(marginSummary([]), { quotedPct: 0, achievedPct: 0, achievedCents: 0 });
  });

  test("edge: a won quote with no costed lines cannot report a percentage", () => {
    const m = marginSummary([
      reportQuote({ status: "accepted", margin_pct: 22, accepted_total_cents: 5_000 }, []),
    ]);
    assert.equal(m.quotedPct, 22);
    assert.equal(m.achievedCents, 5_000);
    assert.equal(m.achievedPct, 0, "no cost base to weigh it against");
  });
});

describe("lossReasons", () => {
  const OPPS: { stage_id: string; lost_reason: LostReason | null }[] = [
    { stage_id: "lost", lost_reason: "price" },
    { stage_id: "lost", lost_reason: "price" },
    { stage_id: "lost", lost_reason: "price" },
    { stage_id: "lost", lost_reason: null },
    { stage_id: "lost", lost_reason: null },
    { stage_id: "lost", lost_reason: "timing" },
    { stage_id: "won", lost_reason: "price" },
    { stage_id: "quoted", lost_reason: null },
  ];

  test("counts lost opportunities worst-first, so the top row is the problem", () => {
    assert.deepEqual(lossReasons(OPPS), [
      { reason: "price", count: 3 },
      { reason: "unrecorded", count: 2 },
      { reason: "timing", count: 1 },
    ]);
  });

  test("an opportunity that is not lost never contributes a reason", () => {
    assert.deepEqual(lossReasons([{ stage_id: "won", lost_reason: "price" }]), []);
    assert.deepEqual(lossReasons([{ stage_id: "quoted", lost_reason: null }]), []);
  });

  test("edge: nothing lost yet is an empty list, not a zero row", () => {
    assert.deepEqual(lossReasons([]), []);
  });
});
