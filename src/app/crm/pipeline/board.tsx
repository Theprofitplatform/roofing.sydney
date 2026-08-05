"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Card, EmptyState, PageHeader } from "@/components/crm/ui";
import { useToast } from "@/components/crm/toast";
import { moneyShort } from "@/lib/money";
import { moveOpportunity } from "./actions";
import { OpportunityTile, type BoardCard, type CardActions } from "./card";
import { OutcomeModal, type OutcomeTarget } from "./outcome-modal";
import { LeadInbox, type LeadRow } from "./leads";
import type { LostReason, PipelineStage, StageId } from "@/lib/db/types";

export function Board({
  stages,
  cards: initialCards,
  leads,
  staleAfterDays,
}: {
  stages: PipelineStage[];
  cards: BoardCard[];
  leads: LeadRow[];
  staleAfterDays: number;
}) {
  const push = useToast();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<OutcomeTarget | null>(null);

  // The move lands on screen immediately and the server's answer replaces it —
  // dragging a card should feel like moving a card, not like filing a request.
  const [cards, applyMove] = useOptimistic(
    initialCards,
    (state: BoardCard[], move: { id: string; stageId: StageId; lostReason: LostReason | null }) =>
      state.map((card) =>
        card.id === move.id
          ? { ...card, stageId: move.stageId, lostReason: move.lostReason }
          : card,
      ),
  );

  const order = useMemo(() => [...stages].sort((a, b) => a.sort - b.sort), [stages]);
  const labelOf = (id: StageId) => order.find((s) => s.id === id)?.label ?? id;

  /** The next stage a card can be advanced into — outcomes are never automatic. */
  const nextOf = (id: StageId) => {
    const index = order.findIndex((stage) => stage.id === id);
    if (index < 0) return null;
    return order.slice(index + 1).find((stage) => !stage.is_terminal) ?? null;
  };

  const move = (card: BoardCard, stageId: StageId, lostReason: LostReason | null = null) => {
    startTransition(async () => {
      applyMove({ id: card.id, stageId, lostReason });
      const result = await moveOpportunity(card.id, stageId, lostReason);
      if (result.ok) push(`${card.clientName} → ${labelOf(stageId)}`, "success", "arrow-right");
      else push(result.error, "error");
    });
  };

  const actions: CardActions = {
    onAdvance: (card) => {
      const next = nextOf(card.stageId);
      if (next) move(card, next.id);
    },
    onWon: (card) =>
      setTarget({
        id: card.id,
        clientName: card.clientName,
        valueCents: card.valueCents,
        outcome: "won",
      }),
    onLost: (card) =>
      setTarget({
        id: card.id,
        clientName: card.clientName,
        valueCents: card.valueCents,
        outcome: "lost",
      }),
    onReopen: (card) => move(card, "quoted"),
  };

  const confirmOutcome = (reason: LostReason | null) => {
    const card = cards.find((c) => c.id === target?.id);
    const outcome = target?.outcome;
    setTarget(null);
    if (card && outcome) move(card, outcome, reason);
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Pipeline"
        description="Every live enquiry. Each column is oldest-first, so the card at the top has been waiting longest."
      />

      <LeadInbox leads={leads} />

      {cards.length === 0 ? (
        <Card>
          <EmptyState icon="kanban" title="Nothing in the pipeline yet">
            Enquiries from roofing.sydney land here automatically. You can also add a
            client and raise an opportunity by hand.
          </EmptyState>
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridAutoFlow: "column",
            gridAutoColumns: "minmax(252px, 1fr)",
            gap: 14,
            alignItems: "start",
            overflowX: "auto",
            paddingBottom: 8,
          }}
        >
          {order.map((stage) => {
            const column = cards.filter((card) => card.stageId === stage.id);
            const value = column.reduce((sum, card) => sum + (card.valueCents ?? 0), 0);
            const next = nextOf(stage.id);

            return (
              <section
                key={stage.id}
                className="card"
                style={{ background: "var(--fill-1)", minWidth: 0 }}
              >
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "11px 13px",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span className="section-label">{stage.label}</span>
                  <span className="ftab__count">{column.length}</span>
                  {value > 0 && (
                    <span
                      className="mono"
                      style={{
                        marginLeft: "auto",
                        font: "600 11.5px/1 var(--font-mono)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {moneyShort(value)}
                    </span>
                  )}
                </header>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 12,
                    minHeight: 72,
                  }}
                >
                  {column.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        font: "400 12px/1.4 var(--font-sans)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      Nothing here.
                    </p>
                  ) : (
                    column.map((card) => (
                      <OpportunityTile
                        key={card.id}
                        card={card}
                        nextStageLabel={next?.label ?? null}
                        isTerminal={stage.is_terminal}
                        staleAfterDays={staleAfterDays}
                        busy={pending}
                        actions={actions}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {target && (
        <OutcomeModal
          target={target}
          busy={pending}
          onClose={() => setTarget(null)}
          onConfirm={confirmOutcome}
        />
      )}
    </div>
  );
}
