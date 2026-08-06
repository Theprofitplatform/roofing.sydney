"use client";

import { useState } from "react";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, MoneyInput, Select } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { money } from "@/lib/money";
import type { InvoiceKind, PaymentMethod } from "@/lib/db/types";

/**
 * The four dialogs the invoice screen opens. Dumb by design: they hold their own
 * form state and hand a validated value back, while the screen owns the
 * transition and the toast. Split out because the screen was heading past the
 * file-size limit with them inline.
 */

const MANUAL_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "bank_transfer", label: "Bank transfer" },
  { id: "cash", label: "Cash" },
  { id: "other", label: "Other" },
];

export function RecordPaymentModal({
  outstandingCents,
  busy,
  onClose,
  onSubmit,
}: {
  outstandingCents: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (amountCents: number, method: PaymentMethod, reference: string) => void;
}) {
  const [amountCents, setAmountCents] = useState(outstandingCents);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");

  const partial = amountCents > 0 && amountCents < outstandingCents;
  const tooMuch = amountCents > outstandingCents;

  return (
    <Modal
      title="Record a payment"
      sub={`${money(outstandingCents)} outstanding on this invoice`}
      onClose={busy ? () => {} : onClose}
      maxWidth={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="brand"
            icon={busy ? "loader-2" : "check"}
            disabled={busy || amountCents <= 0 || tooMuch}
            onClick={() => onSubmit(amountCents, method, reference)}
          >
            {busy ? "Recording…" : "Record payment"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field
          label="Amount received"
          required
          hint={
            partial
              ? `Leaves ${money(outstandingCents - amountCents)} outstanding — the invoice moves to part paid.`
              : "Booked as received today."
          }
        >
          <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} autoFocus />
        </Field>

        <Field label="How it was received" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {MANUAL_METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </Select>
        </Field>

        <Field
          label="Reference"
          hint="Bank transaction id or receipt number. Keeps the same payment from being booked twice."
        >
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. CBA 4417 · 06 Aug"
          />
        </Field>

        {tooMuch && (
          <div className="inline-warn">
            <Icon name="alert-triangle" size={15} />
            That is more than the {money(outstandingCents)} outstanding.
          </div>
        )}
      </div>
    </Modal>
  );
}

export function PaymentLinkModal({
  url,
  expiresAt,
  amountCents,
  onClose,
}: {
  url: string;
  expiresAt: string;
  /** What the link charges — the balance, which is not always the invoice total. */
  amountCents: number;
  onClose: () => void;
}) {
  const toast = useToast();

  const copy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => toast("Payment link copied", "success", "copy"))
      .catch(() => toast("Couldn't copy — select the link and copy it manually", "warning"));
  };

  const expires = new Date(expiresAt).toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });

  return (
    <Modal
      title="Card payment link"
      sub={`Charges ${money(amountCents)} — the balance outstanding. Send it to the client; no account, no login.`}
      onClose={onClose}
      maxWidth={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="brand" icon="copy" onClick={copy}>Copy link</Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field
          label="Stripe Checkout"
          hint={`Expires ${expires}. Generate a fresh link after that — the invoice is unchanged either way.`}
        >
          <Input className="input--mono" value={url} readOnly onFocus={(e) => e.target.select()} />
        </Field>
        <p style={{ margin: 0, font: "400 12.5px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
          Stripe confirms payment by webhook, not by the client reaching the
          thank-you page — so a closed tab still settles the invoice.
        </p>
      </div>
    </Modal>
  );
}

export function RaiseInvoiceModal({
  suggestedCents,
  busy,
  onClose,
  onSubmit,
}: {
  suggestedCents: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (kind: Exclude<InvoiceKind, "deposit">, totalCents: number, dueAt: string) => void;
}) {
  const [kind, setKind] = useState<Exclude<InvoiceKind, "deposit">>(
    suggestedCents > 0 ? "progress" : "final",
  );
  const [totalCents, setTotalCents] = useState(suggestedCents);
  const [dueAt, setDueAt] = useState("");

  return (
    <Modal
      title="Raise another invoice"
      sub="Against the same job. Deposits are raised on acceptance, not here."
      onClose={busy ? () => {} : onClose}
      maxWidth={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="brand"
            icon={busy ? "loader-2" : "receipt"}
            disabled={busy || totalCents <= 0}
            onClick={() => onSubmit(kind, totalCents, dueAt)}
          >
            {busy ? "Raising…" : "Raise invoice"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Kind" required>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as Exclude<InvoiceKind, "deposit">)}
          >
            <option value="progress">Progress claim</option>
            <option value="final">Final invoice</option>
          </Select>
        </Field>

        <Field
          label="Amount"
          required
          hint={
            suggestedCents > 0
              ? `${money(suggestedCents)} of the agreed scope is not yet invoiced.`
              : "The agreed scope is fully invoiced — this bills on top of it."
          }
        >
          <MoneyInput valueCents={totalCents} onChangeCents={setTotalCents} />
        </Field>

        <Field label="Due" hint="Leave blank for due on receipt.">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function VoidInvoiceModal({
  number,
  busy,
  onClose,
  onConfirm,
}: {
  number: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      title={`Void ${number}?`}
      sub="The invoice stays on the books, marked void. Nothing is deleted."
      onClose={busy ? () => {} : onClose}
      maxWidth={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" icon="ban" onClick={onConfirm} disabled={busy}>
            {busy ? "Voiding…" : "Void invoice"}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
        Voiding leaves the invoice number spent, which is deliberate — a reused
        number is a reconciliation problem, not a tidy one. Raise a replacement
        afterwards if the work still needs billing.
      </p>
    </Modal>
  );
}
