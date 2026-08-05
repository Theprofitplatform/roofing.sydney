"use client";

import { useMemo, useState } from "react";
import { Button, Checkbox } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { depositCents, money, moneyShort } from "@/lib/money";
import { extraDelta, priceFor, resolveLines, tierTotals } from "./pricing";
import { Decision } from "./decision";
import type { PortalLine, PortalSelection } from "./pricing";
import type { PortalView } from "./view-model";
import type { Tier } from "@/lib/db/types";

/**
 * The priced half of the quote: options, extras, totals, and the decision.
 *
 * It holds the selection because everything below it moves when the client
 * changes their mind — a tier chooser whose total updates a page-scroll away is
 * a tier chooser nobody uses. The figures it renders were computed on the server
 * from cost; this component only ever looks them up.
 */

const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

export function PortalQuote({
  view,
  children,
}: {
  view: PortalView;
  /**
   * The static tail of the document — inclusions, exclusions, payment terms —
   * rendered on the server and passed through so it sits between the total and
   * the signature, which is the order the acceptance statement refers to them in.
   */
  children?: React.ReactNode;
}) {
  const { pricing } = view;
  const settled = view.status === "accepted" || view.status === "declined";

  // A settled quote shows the client their own choice rather than a live
  // chooser: the decision is made and this page is now a receipt.
  //
  // Falling back to the first offered tier matters for a DECLINED quote:
  // `decline_quote` never records a tier, so seeding straight from
  // `settledTier` would leave a tiered quote with no option selected, and
  // `resolveLines` would then drop every tier line — showing the homeowner a
  // scope and a total that are not the ones they were sent.
  const [tier, setTier] = useState<Tier | null>(
    (settled ? view.settledTier : null) ?? pricing.tiers[0] ?? null,
  );
  const [optionalIds, setOptionalIds] = useState<string[]>(
    settled ? view.settledExtraIds : [],
  );

  const locked = settled || !view.acceptable;

  const selection = useMemo<PortalSelection>(() => ({ tier, optionalIds }), [tier, optionalIds]);
  const totals = useMemo(() => priceFor(pricing, selection), [pricing, selection]);
  const lines = useMemo(() => resolveLines(pricing, selection), [pricing, selection]);
  const tierRow = useMemo(() => tierTotals(pricing, optionalIds), [pricing, optionalIds]);

  const extras = pricing.lines.filter(
    (line) => line.isOptional && (line.tier === null || line.tier === tier),
  );
  const deposit = pricing.depositPct > 0 ? depositCents(totals.total, pricing.depositPct) : 0;

  const materials = lines.filter((l) => l.kind === "material" && !l.isOptional);
  const labour = lines.filter((l) => l.kind === "labour" && !l.isOptional);
  const chosenExtras = lines.filter((l) => l.isOptional);

  const toggleExtra = (id: string, on: boolean) =>
    setOptionalIds((current) =>
      on ? [...current, id] : current.filter((existing) => existing !== id),
    );

  const chooseTier = (next: Tier) => {
    setTier(next);
    // An extra that belongs to a different tier is not on offer under this one.
    // Leaving it ticked would record a choice the client can no longer see.
    setOptionalIds((current) =>
      current.filter((id) => {
        const line = pricing.lines.find((l) => l.id === id);
        return !line || line.tier === null || line.tier === next;
      }),
    );
  };

  return (
    <>
      {pricing.tiers.length > 0 && (
        <div className="qsec">
          <div className="qsec__h">Choose your option</div>
          <div className="qtiers">
            {tierRow.map((option) => (
              <button
                key={option.tier}
                type="button"
                aria-pressed={tier === option.tier}
                disabled={locked}
                className={`qtier ${tier === option.tier ? "is-on" : ""}`}
                onClick={() => chooseTier(option.tier)}
              >
                <span>
                  <span className="qtier__name">{TIER_LABEL[option.tier]}</span>
                  <span className="qtier__note">
                    {tier === option.tier ? "Selected" : "Tap to price this option"}
                  </span>
                </span>
                <span className="qtier__price">{moneyShort(option.total)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="qsec">
        <div className="qsec__h">{pricing.showBreakdown ? "Scope of works" : "The quote"}</div>

        {pricing.showBreakdown ? (
          <>
            <LineGroup caption="Materials" lines={materials} />
            <LineGroup caption="Labour" lines={labour} />
            <LineGroup caption="Extras you've added" lines={chosenExtras} />
          </>
        ) : (
          <div className="qline--single">
            <span className="d">
              Supply and install — {view.roofType.toLowerCase()} as described above
            </span>
            <span className="qline__amt">{money(totals.subtotal)}</span>
          </div>
        )}
      </div>

      {extras.length > 0 && (
        <div className="qsec">
          <div className="qsec__h">Optional extras</div>
          {extras.map((extra) => {
            const on = optionalIds.includes(extra.id);
            const delta = extraDelta(pricing, selection, extra.id);
            return (
              <div key={extra.id} className={`qextra ${on ? "is-on" : ""}`}>
                <Checkbox
                  on={on}
                  disabled={locked}
                  onChange={(next) => toggleExtra(extra.id, next)}
                >
                  {extra.description}
                </Checkbox>
                <span className="qextra__price">+ {money(delta)}</span>
              </div>
            );
          })}
          <div className="qsec__note">
            {!locked && "Tick anything you'd like added — the total updates as you go. "}
            {/* The scope above itemises every line before tax, so an extra can
                show two figures. Saying which is which costs one sentence and
                stops the document looking like it contradicts itself. */}
            {pricing.gstEnabled
              ? "The figure beside each extra is what it adds to your total, including GST."
              : "The figure beside each extra is what it adds to your total."}
          </div>
        </div>
      )}

      <div className="qtotals">
        {pricing.gstEnabled ? (
          <>
            <div className="qtotals__row">
              <span>Subtotal (ex GST)</span>
              <span className="v">{money(totals.subtotal)}</span>
            </div>
            <div className="qtotals__row">
              <span>GST ({pricing.gstRate}%)</span>
              <span className="v">{money(totals.gst)}</span>
            </div>
          </>
        ) : null}

        <div className="qtotals__grand">
          <span className="l">{pricing.gstEnabled ? "Total inc GST" : "Total"}</span>
          <span className="v">{money(totals.total)}</span>
        </div>

        {!pricing.gstEnabled && (
          <div className="qtotals__note">No GST — we are not registered for GST.</div>
        )}

        {deposit > 0 && (
          <div className="qdeposit">
            <Icon name="info" size={14} style={{ verticalAlign: "-2px", marginRight: 7 }} />
            Deposit due on acceptance ({pricing.depositPct}%): <b>{money(deposit)}</b>. We&rsquo;ll
            send you the details once you accept.
          </div>
        )}
      </div>

      {children}

      <Decision
        view={view}
        selection={selection}
        totalCents={totals.total}
        tierLabel={tier ? TIER_LABEL[tier] : null}
      />

      {!locked && (
        <div className="qbar">
          <div>
            <div className="qbar__l">Total{pricing.gstEnabled ? " inc GST" : ""}</div>
            <div className="qbar__v">{moneyShort(totals.total)}</div>
          </div>
          <span className="qbar__spacer" />
          <Button
            variant="brand"
            icon="pen-line"
            onClick={() =>
              document.getElementById("accept")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })
            }
          >
            Accept
          </Button>
        </div>
      )}
    </>
  );
}

function LineGroup({ caption, lines }: { caption: string; lines: PortalLine[] }) {
  if (lines.length === 0) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="qsec__h">{caption}</div>
      {lines.map((line) => (
        <div className="qline" key={line.id}>
          <span className="qline__desc">{line.description}</span>
          <span className="qline__qty">
            {line.qty} {line.unit} × {money(line.unitCents)}
          </span>
          <span className="qline__amt">{money(line.amountCents)}</span>
        </div>
      ))}
    </div>
  );
}
