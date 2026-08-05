import { Card } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { MonthBucket } from "@/lib/reports";
import { Note, READONLY_ROW } from "./bits";
import { compactMoney, monthLabel } from "./format";

/**
 * Quoted versus won value by month, as inline SVG.
 *
 * No charting library: twelve pairs of bars is a hundred lines of geometry, and
 * a dependency that ships its own colour system would be the one place in the
 * CRM not wearing crm.css. Both series are design-system tokens, so the chart
 * follows the operator's light/dark preference without a second palette.
 *
 * The table underneath is not a fallback — it is where the exact figures live.
 * The green reads below 3:1 against a white card, which is fine for a bar whose
 * value is also written down, and not fine for a bar that is the only record.
 */

const QUOTED_FILL = "var(--brand)";
const WON_FILL = "var(--chart-2)";

const W = 640;
const H = 210;
const PAD = { top: 12, right: 8, bottom: 28, left: 50 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const BASELINE = PAD.top + PLOT_H;

/** Round the axis up to a half-decade so the top gridline is a readable figure. */
function axisTop(maxCents: number): number {
  if (maxCents <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(maxCents)) / 2;
  return Math.ceil(maxCents / step) * step;
}

/** A bar with its top corners rounded and its base flat on the axis. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return [
    `M${x} ${y + h}`,
    `V${y + r}`,
    `Q${x} ${y} ${x + r} ${y}`,
    `H${x + w - r}`,
    `Q${x + w} ${y} ${x + w} ${y + r}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

function Swatch({ fill, children }: { fill: string; children: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ width: 10, height: 10, borderRadius: 3, background: fill }}
      />
      {children}
    </span>
  );
}

export function MonthChart({ buckets }: { buckets: MonthBucket[] }) {
  const head = (
    <div className="card-head">
      <div>
        <div className="card-title">Quoted and won by month</div>
        <div className="card-sub">
          Quoted counts from the day a quote was issued, won from the day it was
          accepted — so a quote sent in March and accepted in May appears in both.
        </div>
      </div>
    </div>
  );

  const legend = (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 14,
        marginBottom: 8,
        font: "500 12px/1 var(--font-sans)",
        color: "var(--muted-foreground)",
      }}
    >
      <Swatch fill={QUOTED_FILL}>Quoted</Swatch>
      <Swatch fill={WON_FILL}>Won</Swatch>
    </div>
  );

  if (buckets.length === 0) {
    return (
      <Card padding>
        {head}
        <Note>
          Nothing to plot yet. A month appears here once a quote is issued in it
          or accepted in it.
        </Note>
      </Card>
    );
  }

  const top = axisTop(
    Math.max(...buckets.map((b) => Math.max(b.quoted.totalCents, b.won.totalCents))),
  );
  const groupW = PLOT_W / buckets.length;
  const barW = Math.min(15, Math.max(4, groupW / 2 - 3));
  const gap = 3;

  const first = monthLabel(buckets[0].month).full;
  const last = monthLabel(buckets[buckets.length - 1].month).full;

  return (
    <Card padding>
      {head}
      {legend}

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Quoted and won value for each month from ${first} to ${last}. The table below lists the same figures.`}
          style={{ display: "block", width: "100%", minWidth: 520, height: "auto" }}
        >
          {[0, 0.5, 1].map((fraction) => {
            const y = BASELINE - fraction * PLOT_H;
            return (
              <g key={fraction}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke={fraction === 0 ? "var(--border)" : "var(--hairline)"}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize={10}
                  fill="var(--muted-foreground)"
                  className="tabular-nums"
                >
                  {compactMoney(top * fraction)}
                </text>
              </g>
            );
          })}

          {buckets.map((bucket, index) => {
            const label = monthLabel(bucket.month);
            const cx = PAD.left + groupW * (index + 0.5);
            const quotedH = (bucket.quoted.totalCents / top) * PLOT_H;
            const wonH = (bucket.won.totalCents / top) * PLOT_H;

            return (
              <g key={bucket.month}>
                {quotedH > 0.5 && (
                  <path
                    d={barPath(cx - gap / 2 - barW, BASELINE - quotedH, barW, quotedH)}
                    fill={QUOTED_FILL}
                  >
                    <title>
                      {`${label.full} — quoted ${money(bucket.quoted.totalCents)} across ${bucket.quoted.count} quote${bucket.quoted.count === 1 ? "" : "s"}`}
                    </title>
                  </path>
                )}
                {wonH > 0.5 && (
                  <path
                    d={barPath(cx + gap / 2, BASELINE - wonH, barW, wonH)}
                    fill={WON_FILL}
                  >
                    <title>
                      {`${label.full} — won ${money(bucket.won.totalCents)} across ${bucket.won.count} quote${bucket.won.count === 1 ? "" : "s"}`}
                    </title>
                  </path>
                )}
                <text
                  x={cx}
                  y={H - 9}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--muted-foreground)"
                >
                  {label.short}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="table-wrap table-wrap--cards" style={{ marginTop: 16 }}>
        <table className="table table--cards">
          <caption className="section-label" style={{ padding: "11px 16px", textAlign: "left" }}>
            {first} to {last}
          </caption>
          <thead>
            <tr>
              <th>Month</th>
              <th className="t-right">Quotes issued</th>
              <th className="t-right">Quoted value</th>
              <th className="t-right">Quotes won</th>
              <th className="t-right">Won value</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={bucket.month} style={READONLY_ROW}>
                <td data-label="Month" style={{ fontWeight: 600 }}>
                  {monthLabel(bucket.month).full}
                </td>
                <td className="num" data-label="Quotes issued">
                  {bucket.quoted.count}
                </td>
                <td className="num" data-label="Quoted value">
                  {money(bucket.quoted.totalCents)}
                </td>
                <td className="num" data-label="Quotes won">
                  {bucket.won.count}
                </td>
                <td className="num" data-label="Won value">
                  {money(bucket.won.totalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note>
        Only months with activity appear, so a quiet month is missing from the
        axis rather than drawn as a zero. Read the bars as a sequence of trading
        months, not as an evenly spaced timeline.
      </Note>
    </Card>
  );
}
