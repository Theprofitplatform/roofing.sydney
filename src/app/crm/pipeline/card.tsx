"use client";

import Link from "next/link";
import { Button, IconButton } from "@/components/crm/ui";
import { moneyShort } from "@/lib/money";
import { LOST_LABEL } from "./outcome-modal";
import type { LostReason, StageId } from "@/lib/db/types";

/**
 * Exactly what a board card renders. The server does the date arithmetic and the
 * quote pricing and hands down finished figures — the card is presentation and a
 * set of one-tap intents, nothing more.
 */
export interface BoardCard {
  id: string;
  clientId: string;
  clientName: string;
  propertyAddress: string | null;
  /** Roof type where known, otherwise the enquiry's own title. */
  subject: string | null;
  stageId: StageId;
  lostReason: LostReason | null;
  quoteCount: number;
  valueCents: number | null;
  /** Calendar days since the card last moved — the staleness signal. */
  stageDays: number;
}

export interface CardActions {
  onAdvance: (card: BoardCard) => void;
  onWon: (card: BoardCard) => void;
  onLost: (card: BoardCard) => void;
  onReopen: (card: BoardCard) => void;
}

export function OpportunityTile({
  card,
  nextStageLabel,
  isTerminal,
  staleAfterDays,
  busy,
  actions,
}: {
  card: BoardCard;
  nextStageLabel: string | null;
  isTerminal: boolean;
  /** The operator's own definition of "too long without contact". */
  staleAfterDays: number;
  busy: boolean;
  actions: CardActions;
}) {
  // Three times the follow-up window is long enough that the card is not being
  // worked at all, which is a different problem from simply being due a chase.
  const level =
    card.stageDays >= staleAfterDays * 3
      ? "critical"
      : card.stageDays >= staleAfterDays
        ? "warning"
        : null;

  return (
    <article
      className="card"
      style={{ padding: "11px 12px", display: "flex", flexDirection: "column", gap: 9 }}
    >
      <Link
        href={`/clients/${card.clientId}`}
        style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}
      >
        <span style={{ display: "block", font: "600 13px/1.3 var(--font-sans)" }}>
          {card.clientName}
        </span>
        {card.propertyAddress && (
          <span
            style={{
              display: "block",
              marginTop: 3,
              font: "400 11.5px/1.35 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            {card.propertyAddress}
          </span>
        )}
      </Link>

      {card.subject && (
        <div style={{ font: "500 12px/1.35 var(--font-sans)", color: "var(--muted-foreground)" }}>
          {card.subject}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {card.valueCents != null && (
          <span className="mono" style={{ font: "600 12.5px/1 var(--font-mono)" }}>
            {moneyShort(card.valueCents)}
          </span>
        )}
        {/* No chip on a card with nothing to open — a link to an empty list is a dead end. */}
        {card.quoteCount > 0 && (
          <Link
            className="chip"
            href={`/quotes?client=${card.clientId}`}
            style={{ textDecoration: "none" }}
          >
            {card.quoteCount} {card.quoteCount === 1 ? "quote" : "quotes"}
          </Link>
        )}
        <span
          className={level ? `nudge nudge--${level}` : undefined}
          style={{
            marginLeft: "auto",
            marginTop: 0,
            font: "500 10.5px/1.3 var(--font-sans)",
            color: level ? undefined : "var(--muted-foreground)",
          }}
        >
          {card.stageDays === 0 ? "moved today" : `${card.stageDays}d in stage`}
        </span>
      </div>

      {card.stageId === "lost" && card.lostReason && (
        <div>
          <span className="pill pill--warning pill--no-dot">{LOST_LABEL[card.lostReason]}</span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {isTerminal ? (
          <Button
            size="sm"
            variant="ghost"
            icon="rotate-ccw"
            disabled={busy}
            onClick={() => actions.onReopen(card)}
          >
            Reopen
          </Button>
        ) : (
          <>
            {nextStageLabel && (
              <Button
                size="sm"
                variant="outline"
                iconRight="arrow-right"
                disabled={busy}
                style={{ flex: 1, minWidth: 0 }}
                onClick={() => actions.onAdvance(card)}
              >
                {nextStageLabel}
              </Button>
            )}
            <IconButton
              icon="check-circle"
              size={15}
              title={`Mark ${card.clientName} as won`}
              disabled={busy}
              onClick={() => actions.onWon(card)}
            />
            <IconButton
              icon="ban"
              size={15}
              title={`Mark ${card.clientName} as lost`}
              disabled={busy}
              onClick={() => actions.onLost(card)}
            />
          </>
        )}
      </div>
    </article>
  );
}
