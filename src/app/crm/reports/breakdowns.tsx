import { Card } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { Breakdown, PipelineValue } from "@/lib/reports";
import { Note, Rate, READONLY_ROW, ThinSampleNote } from "./bits";
import { isThinSample, lossReasonLabel, pct } from "./format";

/**
 * The tabular half of the report: where the money is sitting, what kind of work
 * converts, which lead sources are worth their cost, and why jobs are lost.
 */

export function PipelineTable({ pipeline }: { pipeline: PipelineValue }) {
  const rows = [
    { label: "Open", hint: "Issued, awaiting a decision", summary: pipeline.open },
    { label: "Won", hint: "Accepted by the client", summary: pipeline.won },
    { label: "Lost", hint: "Declined or lapsed", summary: pipeline.lost },
    { label: "Drafts", hint: "Not yet issued", summary: pipeline.drafts },
  ];

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Pipeline value</div>
          <div className="card-sub">
            Accepted quotes are valued at what the client actually accepted;
            everything else at the figure frozen when it was issued.
          </div>
        </div>
      </div>

      <div className="table-wrap table-wrap--cards">
        <table className="table table--cards">
          <thead>
            <tr>
              <th>State</th>
              <th className="t-right">Quotes</th>
              <th className="t-right">Value</th>
              <th className="t-right">Average</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} style={READONLY_ROW}>
                <td data-label="State" className="cell-stack">
                  <div style={{ fontWeight: 600 }}>{row.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>
                    {row.hint}
                  </div>
                </td>
                <td className="num" data-label="Quotes">
                  {row.summary.count}
                </td>
                <td className="num" data-label="Value" style={{ fontWeight: 600 }}>
                  {money(row.summary.totalCents)}
                </td>
                <td className="num" data-label="Average">
                  {row.summary.count === 0 ? "—" : money(row.summary.averageCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note>
        Superseded revisions are left out of every row, so a job you re-quoted
        twice counts once rather than three times.
      </Note>
    </Card>
  );
}

export function ConversionTable({
  title,
  sub,
  dimension,
  rows,
  empty,
}: {
  title: string;
  sub: string;
  /** Column heading for the thing being sliced — "Job type", "Lead source". */
  dimension: string;
  rows: Breakdown[];
  empty: string;
}) {
  const anyThin = rows.some((row) => isThinSample(row.won + row.lost));

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub">{sub}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <Note>{empty}</Note>
      ) : (
        <>
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>{dimension}</th>
                  <th className="t-right">Quotes</th>
                  <th className="t-right">Won</th>
                  <th className="t-right">Lost</th>
                  <th className="t-right">Win rate</th>
                  <th className="t-right">Won value</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} style={READONLY_ROW}>
                    <td data-label={dimension} style={{ fontWeight: 600 }}>
                      {row.key}
                    </td>
                    <td className="num" data-label="Quotes">
                      {row.quoted}
                    </td>
                    <td className="num" data-label="Won">
                      {row.won}
                    </td>
                    <td className="num" data-label="Lost">
                      {row.lost}
                    </td>
                    <td className="num" data-label="Win rate" style={{ fontWeight: 600 }}>
                      <Rate value={row.pct} decided={row.won + row.lost} />
                    </td>
                    <td className="num" data-label="Won value">
                      {money(row.wonValueCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Note>
            Quotes counts everything raised in that slice, drafts included. Win
            rate is measured over decided quotes only, so the two columns will not
            reconcile while work is still open.
          </Note>
          {anyThin && <ThinSampleNote />}
        </>
      )}
    </Card>
  );
}

export function LossReasons({ reasons }: { reasons: { reason: string; count: number }[] }) {
  const total = reasons.reduce((sum, row) => sum + row.count, 0);

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Why work is lost</div>
          <div className="card-sub">
            Worst first — the top row is the problem worth working on.
          </div>
        </div>
      </div>

      {total === 0 ? (
        <Note>
          Nothing has been marked lost yet. This table earns its place the moment
          it can tell you whether you are losing on price or on silence — the two
          have opposite fixes.
        </Note>
      ) : (
        <>
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th className="t-right">Opportunities</th>
                  <th className="t-right">Share</th>
                  <th style={{ width: "34%" }} />
                </tr>
              </thead>
              <tbody>
                {reasons.map((row) => {
                  const share = (row.count / total) * 100;
                  return (
                    <tr key={row.reason} style={READONLY_ROW}>
                      <td data-label="Reason" style={{ fontWeight: 600 }}>
                        {lossReasonLabel(row.reason)}
                      </td>
                      <td className="num" data-label="Opportunities">
                        {row.count}
                      </td>
                      <td className="num" data-label="Share">
                        {pct(share)}
                      </td>
                      <td data-label="">
                        <div
                          aria-hidden="true"
                          style={{
                            height: 6,
                            borderRadius: 3,
                            background: "var(--fill-strong)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${share}%`,
                              height: "100%",
                              borderRadius: 3,
                              background: "var(--status-critical)",
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Note>
            The pipeline refuses to close an opportunity as lost without a reason,
            so &ldquo;Not recorded&rdquo; can only come from data that predates
            that rule.
          </Note>
        </>
      )}
    </Card>
  );
}
