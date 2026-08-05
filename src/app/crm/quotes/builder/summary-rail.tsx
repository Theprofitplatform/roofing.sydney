"use client";

import { Icon } from "@/components/crm/icon";
import { Button, Card, InternalBadge } from "@/components/crm/ui";
import { money, moneyShort } from "@/lib/money";
import type { ScopedTotals } from "@/lib/quote-pricing";
import type { Tier } from "@/lib/db/types";

export type SaveStatus = "unsaved" | "dirty" | "saving" | "saved";

const SAVE_LABEL: Record<SaveStatus, string> = {
  unsaved: "Not saved yet",
  dirty: "Unsaved changes",
  saving: "Saving…",
  saved: "All changes saved",
};

const SAVE_CLASS: Record<SaveStatus, string> = {
  unsaved: "",
  dirty: "is-dirty",
  saving: "is-saving",
  saved: "is-saved",
};

const SAVE_ICON: Record<SaveStatus, string> = {
  unsaved: "circle",
  dirty: "circle-dot",
  saving: "loader-2",
  saved: "check",
};

/** `compact` drops the wording for the mobile bar, where there is no room for it. */
export function SaveStateBadge({
  status,
  compact,
  className = "",
}: {
  status: SaveStatus;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`save-state ${SAVE_CLASS[status]} ${className}`} title={SAVE_LABEL[status]}>
      <Icon
        name={SAVE_ICON[status]}
        size={12}
        className={status === "saving" ? "spin-ic" : undefined}
      />
      {!compact && SAVE_LABEL[status]}
    </span>
  );
}

const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

/**
 * The one number the operator must never lose sight of, and the internal
 * figures behind it.
 *
 * The rail reads top to bottom as cost → margin → price, which is the model the
 * whole product rests on. It deliberately does NOT present cost subtotal +
 * margin as if it summed to the client's total: with the breakdown printed, the
 * client's subtotal is the sum of individually rounded lines and can differ from
 * the internal arithmetic by a cent. Showing the client-facing price on its own
 * row means the figure here is always the figure on the PDF.
 *
 * Optional extras sit below the total rather than inside it. The client has not
 * chosen them, and costing a job against revenue nobody agreed to is how a
 * healthy-looking month turns out not to be one.
 */
export function SummaryRail({
  totals,
  marginPct,
  gstEnabled,
  gstRate,
  extrasCents,
  extrasCount,
  tiers,
  previewTier,
  tierTotals,
  onPreviewTier,
  saveStatus,
  canSave,
  clientEmail,
  onSave,
  onReview,
}: {
  totals: ScopedTotals;
  marginPct: number;
  gstEnabled: boolean;
  gstRate: number;
  extrasCents: number;
  extrasCount: number;
  tiers: Tier[];
  previewTier: Tier | null;
  tierTotals: { tier: Tier; total: number }[];
  onPreviewTier: (tier: Tier) => void;
  saveStatus: SaveStatus;
  canSave: boolean;
  clientEmail: string | null;
  onSave: () => void;
  onReview: () => void;
}) {
  return (
    <div className="builder__rail">
      <Card className="summary">
        <div className="section-label" style={{ marginBottom: 6 }}>
          Quote summary
        </div>

        {tiers.length > 0 && (
          <div style={{ margin: "6px 0 12px" }}>
            <div className="seg" style={{ display: "flex", width: "100%" }}>
              {tiers.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`seg__btn ${previewTier === t ? "is-active" : ""}`}
                  style={{ flex: 1 }}
                  onClick={() => onPreviewTier(t)}
                >
                  {TIER_LABEL[t]}
                </button>
              ))}
            </div>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                flexDirection: "column",
                gap: 3,
                font: "400 11px/1.4 var(--font-sans)",
                color: "var(--muted-foreground)",
              }}
            >
              {tierTotals.map(({ tier: t, total }) => (
                <div key={t} style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{TIER_LABEL[t]} option</span>
                  <span className="mono">{moneyShort(total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="summary__row">
          <span className="lbl">Materials</span>
          <span className="val">{money(totals.matCents)}</span>
        </div>
        <div className="summary__row">
          <span className="lbl">Labour</span>
          <span className="val">{money(totals.labCents)}</span>
        </div>
        <div className="summary__divider" />
        <div className="summary__row">
          <span className="lbl">
            Cost subtotal <InternalBadge />
          </span>
          <span className="val">{money(totals.subtotal)}</span>
        </div>
        <div className="summary__row">
          <span className="lbl">
            Margin ({marginPct}%) <InternalBadge />
          </span>
          <span className="val">{money(totals.margin)}</span>
        </div>
        <div className="summary__divider" />
        <div className="summary__row">
          <span className="lbl">Client price{gstEnabled ? " (ex GST)" : ""}</span>
          <span className="val">{money(totals.display.subtotal)}</span>
        </div>
        {gstEnabled && (
          <div className="summary__row">
            <span className="lbl">GST ({gstRate}%)</span>
            <span className="val">{money(totals.display.gst)}</span>
          </div>
        )}
        <div className="summary__divider" />
        <div className="summary__total">
          <span className="lbl">Total{gstEnabled ? " (inc GST)" : ""}</span>
          <span className="val">{moneyShort(totals.display.total)}</span>
        </div>
        {!gstEnabled && (
          <div className="summary__gst-note">No GST applied — business is not GST-registered.</div>
        )}

        {extrasCount > 0 && (
          <>
            <div className="summary__divider" />
            <div className="summary__row">
              <span className="lbl">
                Client-selectable extras
                <span style={{ display: "block", fontSize: 10.5, marginTop: 2 }}>
                  {extrasCount} line{extrasCount === 1 ? "" : "s"} — not in the total above
                </span>
              </span>
              <span className="val">+{moneyShort(extrasCents)}</span>
            </div>
          </>
        )}

        <div className="summary__actions">
          <Button variant="brand" icon="save" onClick={onSave} disabled={!canSave}>
            Save draft
          </Button>
          <Button variant="outline" icon="file-text" onClick={onReview} disabled={!canSave}>
            Review &amp; send
          </Button>
        </div>

        <div style={{ marginTop: 12 }}>
          <SaveStateBadge status={saveStatus} />
        </div>

        {!canSave && (
          <div
            style={{
              marginTop: 10,
              font: "400 11px/1.4 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            Add a client and at least one described line item to save.
          </div>
        )}
        {canSave && !clientEmail && (
          <div
            style={{
              marginTop: 10,
              font: "400 11px/1.4 var(--font-sans)",
              color: "var(--status-warning)",
            }}
          >
            Client has no email on file — add one to enable sending.
          </div>
        )}
      </Card>
    </div>
  );
}
