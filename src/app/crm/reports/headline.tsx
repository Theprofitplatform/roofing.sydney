import { InternalBadge } from "@/components/crm/ui";
import { moneyShort } from "@/lib/money";
import type { MarginSummary, PipelineValue, WinRate } from "@/lib/reports";
import { KpiTile, Note } from "./bits";
import { isThinSample, pct } from "./format";

/**
 * The four figures a roofer would want if the page could only show four.
 *
 * Each one is stated with the sample it rests on beside it, because on a book of
 * thirty quotes the count is as much of the answer as the percentage is.
 */
export function Headline({
  rate,
  pipeline,
  margin,
}: {
  rate: WinRate;
  pipeline: PipelineValue;
  margin: MarginSummary;
}) {
  // Averaged over quotes that actually went to a client. Drafts are half-built
  // by definition and would drag the figure down with work nobody has priced
  // yet; superseded revisions are excluded upstream so a re-quoted job is not
  // counted twice.
  const issuedCount = pipeline.open.count + pipeline.won.count + pipeline.lost.count;
  const issuedValue =
    pipeline.open.totalCents + pipeline.won.totalCents + pipeline.lost.totalCents;
  const averageIssued = issuedCount === 0 ? 0 : Math.round(issuedValue / issuedCount);

  const hasWon = pipeline.won.count > 0;

  return (
    <section>
      <div
        className="kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        <KpiTile
          icon="trending-up"
          label="Win rate"
          muted={rate.decided === 0}
          value={
            rate.decided === 0
              ? "—"
              : isThinSample(rate.decided)
                ? `${rate.won} of ${rate.decided}`
                : pct(rate.pct)
          }
          // `rate.open` counts drafts as open, which would contradict the
          // pipeline table sitting directly underneath. The figure that belongs
          // beside a win rate is issued work still awaiting a decision.
          sub={`${rate.won} won · ${rate.lost} lost · ${pipeline.open.count} awaiting a decision`}
        />

        <KpiTile
          icon="file-text"
          label="Average issued quote"
          muted={issuedCount === 0}
          value={issuedCount === 0 ? "—" : moneyShort(averageIssued)}
          sub={
            issuedCount === 0
              ? "Nothing issued yet"
              : `Across ${issuedCount} issued quote${issuedCount === 1 ? "" : "s"} — drafts excluded`
          }
        />

        <KpiTile
          icon="check-circle"
          label="Won value"
          muted={!hasWon}
          value={hasWon ? moneyShort(pipeline.won.totalCents) : "—"}
          sub={
            hasWon
              ? `${pipeline.won.count} accepted · ${moneyShort(pipeline.won.averageCents)} average`
              : "No quote has been accepted yet"
          }
        />

        <KpiTile
          icon="dollar-sign"
          label="Achieved margin"
          badge={<InternalBadge />}
          muted={!hasWon}
          value={hasWon ? pct(margin.achievedPct) : "—"}
          sub={
            hasWon
              ? `${pct(margin.quotedPct)} quoted · ${moneyShort(margin.achievedCents)} banked`
              : "Needs won work before it means anything"
          }
        />
      </div>

      <Note>
        Achieved margin is weighted by cost, not averaged per quote: 30% on a $900
        leak repair and 15% on a $90,000 re-roof do not average to 22.5% in any
        sense that pays wages. Quoted margin is the straight average across won
        quotes, so read the two as separate views rather than subtracting one from
        the other. Both are internal — the client document prints sell prices and
        never your margin.
      </Note>
    </section>
  );
}
