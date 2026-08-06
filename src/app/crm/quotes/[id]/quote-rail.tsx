"use client";

import Link from "next/link";

import { Icon } from "@/components/crm/icon";
import { Button, Card, InternalBadge } from "@/components/crm/ui";
import { money, moneyShort } from "@/lib/money";
import type { ScopedTotals } from "@/lib/quote-pricing";
import { nudgeLevel, nudgeText, quoteFlags } from "@/lib/quote-state";
import type { Client, Quote, Settings } from "@/lib/db/types";

import { formatDay, formatFull, quoteLabel } from "../helpers";

/**
 * The left-hand rail of the quote view: where this quote is up to, who it is
 * for, and what it is worth.
 *
 * Every internal figure carries `<InternalBadge/>`. The operator has both the
 * cost side and the client side of the same quote on one screen, and the whole
 * cost-in/margin-out model depends on never confusing the two.
 */

function StatusTimeline({ quote }: { quote: Quote }) {
  const steps = [
    { key: "draft", label: "Created", date: quote.created_at, icon: "pen-line" },
    { key: "sent", label: "Sent to client", date: quote.sent_at, icon: "send" },
    { key: "viewed", label: "Viewed by client", date: quote.viewed_at, icon: "eye" },
    quote.declined_at
      ? { key: "decided", label: "Declined", date: quote.declined_at, icon: "ban" }
      : { key: "decided", label: "Accepted", date: quote.accepted_at, icon: "check-circle" },
  ];

  return (
    <div className="timeline">
      {steps.map((step, index) => {
        const done = Boolean(step.date);
        return (
          <div
            key={step.key}
            className={`timeline__step ${done ? "is-done" : ""} ${
              index === steps.length - 1 ? "is-last" : ""
            }`}
          >
            <span className="timeline__dot">
              <Icon
                name={done ? step.icon : "circle"}
                size={done ? 11 : 8}
                strokeWidth={done ? 2.4 : 2}
              />
            </span>
            <div className="timeline__body">
              <span className="timeline__label">{step.label}</span>
              <span className="timeline__date">{done ? formatDay(step.date) : "—"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function QuoteRail({
  quote,
  client,
  settings,
  revisions,
  priced,
  portalUrl,
  onCopyPortalLink,
}: {
  quote: Quote;
  client: Client;
  settings: Settings;
  revisions: Quote[];
  priced: ScopedTotals;
  portalUrl: string | null;
  onCopyPortalLink: () => void;
}) {
  const issued = Boolean(quote.sent_at);
  const flags = quoteFlags(quote, { follow_up_days: settings.follow_up_days });
  const nudge = nudgeText(flags);

  return (
    <div className="qview__rail">
      <Card padding>
        <div className="section-label" style={{ marginBottom: 12 }}>
          Status
        </div>
        <StatusTimeline quote={quote} />
        {nudge && (
          <div className={`nudge nudge--${nudgeLevel(flags)}`} style={{ marginTop: 12 }}>
            {nudge}
          </div>
        )}
      </Card>

      {revisions.length > 1 && (
        <Card padding>
          <div className="section-label" style={{ marginBottom: 10 }}>
            Revisions
          </div>
          {revisions.map((revision) => (
            <div className="meta-row" key={revision.id}>
              <span className="k">
                <Icon
                  name="corner-down-right"
                  size={12}
                  style={{ marginRight: 6, verticalAlign: "-2px" }}
                />
                v{revision.version} · {quoteLabel(revision)}
              </span>
              <span className="v">
                {revision.id === quote.id ? (
                  "This quote"
                ) : (
                  <Link href={`/quotes/${revision.id}`}>Open</Link>
                )}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card padding>
        <div className="section-label" style={{ marginBottom: 6 }}>
          Details
        </div>
        <div className="meta-row">
          <span className="k">Client</span>
          <span className="v">{client.name}</span>
        </div>
        <div className="meta-row">
          <span className="k">Phone</span>
          <span className="v mono">{client.phone || "—"}</span>
        </div>
        <div className="meta-row">
          <span className="k">Email</span>
          <span
            className="v"
            style={{ color: client.email ? undefined : "var(--status-warning)" }}
          >
            {client.email || "None on file"}
          </span>
        </div>
        <div className="meta-row">
          <span className="k">Property</span>
          <span className="v" style={{ maxWidth: 170, textAlign: "right", whiteSpace: "normal" }}>
            {client.property_address || "—"}
          </span>
        </div>
        <div className="meta-row">
          <span className="k">Valid for</span>
          <span className="v">{quote.valid_days} days</span>
        </div>
        {issued && (
          <div className="meta-row">
            <span className="k">Issued</span>
            <span className="v">{formatFull(quote.sent_at)}</span>
          </div>
        )}
        {quote.signed_name && (
          <div className="meta-row">
            <span className="k">Signed by</span>
            <span className="v">{quote.signed_name}</span>
          </div>
        )}
      </Card>

      <Card padding>
        <div className="section-label" style={{ marginBottom: 10 }}>
          Totals
        </div>
        <div className="summary__row">
          <span className="lbl">
            Cost subtotal <InternalBadge />
          </span>
          <span className="val">{money(priced.subtotal)}</span>
        </div>
        <div className="summary__row">
          <span className="lbl">
            Margin ({quote.margin_pct}%) <InternalBadge />
          </span>
          <span className="val">{money(priced.margin)}</span>
        </div>
        <div className="summary__divider" />
        <div className="summary__row">
          <span className="lbl">Client price{quote.gst_enabled ? " (ex GST)" : ""}</span>
          <span className="val">{money(priced.display.subtotal)}</span>
        </div>
        {quote.gst_enabled && (
          <div className="summary__row">
            <span className="lbl">GST ({quote.gst_rate}%)</span>
            <span className="val">{money(priced.display.gst)}</span>
          </div>
        )}
        <div className="summary__divider" />
        <div className="summary__total">
          <span className="lbl">Total</span>
          <span className="val">
            {moneyShort(quote.total_cents ?? priced.display.total)}
          </span>
        </div>
        {quote.accepted_total_cents != null &&
          quote.accepted_total_cents !== quote.total_cents && (
            <div className="summary__gst-note">
              Client accepted {moneyShort(quote.accepted_total_cents)} after choosing
              {quote.selected_tier ? ` the ${quote.selected_tier} option` : " extras"}.
            </div>
          )}
      </Card>

      {portalUrl && (
        <Button variant="outline" icon="link-2" onClick={onCopyPortalLink}>
          Copy portal link
        </Button>
      )}

      {issued ? (
        <div
          style={{
            font: "400 12px/1.5 var(--font-sans)",
            color: "var(--muted-foreground)",
            padding: "0 4px",
          }}
        >
          <Icon name="lock" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Issued quotes can&apos;t be edited — the client already has this document. Revise to
          raise a linked v{quote.version + 1} and supersede this one.
        </div>
      ) : (
        <div
          style={{
            font: "400 12px/1.5 var(--font-sans)",
            color: "var(--muted-foreground)",
            padding: "0 4px",
          }}
        >
          <Icon name="info" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          This quote is a draft. Sending it draws its number and freezes the totals.
        </div>
      )}
    </div>
  );
}
