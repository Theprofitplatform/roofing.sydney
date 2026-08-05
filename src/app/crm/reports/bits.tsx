import type { ReactNode } from "react";
import { Icon } from "@/components/crm/icon";
import { isThinSample, pct } from "./format";

/**
 * Small presentational pieces shared by the reporting sections. Everything here
 * is a Server Component — the page has no interaction at all, so nothing needs
 * to reach the browser as JavaScript.
 */

/**
 * The report tables are read-only. `.table tbody tr` in crm.css carries a
 * pointer cursor because every other table in the CRM opens a record; leaving it
 * here would promise a click that does nothing.
 */
export const READONLY_ROW = { cursor: "default" } as const;

export function KpiTile({
  icon,
  label,
  value,
  sub,
  badge,
  muted,
}: {
  icon: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Sits beside the label — this is where `<InternalBadge />` goes. */
  badge?: ReactNode;
  /** Greys the figure when it is a placeholder rather than a measurement. */
  muted?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11.5,
          color: "var(--muted-foreground)",
          fontWeight: 600,
        }}
      >
        <Icon name={icon} size={14} />
        {label}
        {badge}
      </div>
      <div
        className="tabular-nums"
        style={{
          font: "700 24px/1.2 var(--font-sans)",
          marginTop: 8,
          letterSpacing: "-0.01em",
          color: muted ? "var(--muted-foreground)" : undefined,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            font: "400 11.5px/1.4 var(--font-sans)",
            color: "var(--muted-foreground)",
            marginTop: 5,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * A win rate, or an honest refusal to state one.
 *
 * The dash is not a missing value — it is the finding. Hovering says how many
 * decided quotes the row actually rests on, so the operator can see the sample
 * grow rather than wonder whether the page is broken.
 */
export function Rate({ value, decided }: { value: number; decided: number }) {
  if (isThinSample(decided)) {
    return (
      <span
        style={{ color: "var(--muted-foreground)" }}
        title={
          decided === 0
            ? "No decided quotes yet — nothing to rate."
            : `Only ${decided} decided quote${decided === 1 ? "" : "s"} — too few to state a win rate.`
        }
      >
        —
      </span>
    );
  }
  return <>{pct(value)}</>;
}

/** Footnote under a table that contains at least one thin-sample dash. */
export function ThinSampleNote() {
  return (
    <p
      style={{
        margin: "10px 0 0",
        font: "400 11.5px/1.5 var(--font-sans)",
        color: "var(--muted-foreground)",
      }}
    >
      A dash means fewer than five decided quotes in that row — the counts are
      real, a percentage drawn from them would not be.
    </p>
  );
}

/** A quiet explanatory line under a section. Prose, not a caption. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: "12px 0 0",
        font: "400 12px/1.6 var(--font-sans)",
        color: "var(--muted-foreground)",
        maxWidth: "72ch",
      }}
    >
      {children}
    </p>
  );
}
