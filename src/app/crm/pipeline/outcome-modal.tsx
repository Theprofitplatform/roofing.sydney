"use client";

import { useState } from "react";
import { Modal } from "@/components/crm/modal";
import { Button } from "@/components/crm/ui";
import { moneyShort } from "@/lib/money";
import type { LostReason } from "@/lib/db/types";

/** The five reasons the schema accepts, in the order they actually happen. */
export const LOST_LABEL: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing",
  went_elsewhere: "Went elsewhere",
  no_response: "No response",
  cancelled: "Cancelled",
};

const REASONS = Object.keys(LOST_LABEL) as LostReason[];

export interface OutcomeTarget {
  id: string;
  clientName: string;
  valueCents: number | null;
  outcome: "won" | "lost";
}

/**
 * Won is a one-click confirm; lost collects a reason first.
 *
 * The reason is not politeness — the database refuses a lost opportunity without
 * one, because an outcome with no reason teaches you nothing about why you are
 * losing work. Asking here means the operator never meets that rejection.
 */
export function OutcomeModal({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: OutcomeTarget;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: LostReason | null) => void;
}) {
  const [reason, setReason] = useState<LostReason | null>(null);
  const won = target.outcome === "won";
  const value = target.valueCents == null ? null : moneyShort(target.valueCents);

  return (
    <Modal
      title={won ? "Mark as won?" : "Mark as lost?"}
      sub={[target.clientName, value].filter(Boolean).join(" · ")}
      maxWidth={440}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {won ? (
            <Button variant="brand" icon="check-circle" disabled={busy} onClick={() => onConfirm(null)}>
              Mark as won
            </Button>
          ) : (
            <Button
              variant="danger"
              icon="ban"
              disabled={busy || !reason}
              onClick={() => reason && onConfirm(reason)}
            >
              Mark as lost
            </Button>
          )}
        </>
      }
    >
      {won ? (
        <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
          This closes the opportunity and moves it out of the live board. Quotes and
          history stay exactly where they are.
        </p>
      ) : (
        <>
          <p style={{ margin: "0 0 12px", color: "var(--muted-foreground)" }}>
            Why did this one go? It is the only figure that tells you whether price or
            response time is costing you work.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REASONS.map((id) => (
              <button
                key={id}
                type="button"
                className={`chip ${reason === id ? "is-active" : ""}`}
                aria-pressed={reason === id}
                onClick={() => setReason(id)}
              >
                {LOST_LABEL[id]}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
