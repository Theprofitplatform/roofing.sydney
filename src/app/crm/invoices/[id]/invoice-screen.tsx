"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, InternalBadge, PageHeader, SectionLabel } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { money } from "@/lib/money";
import type { InvoiceRow } from "@/lib/db/invoices";
import type { InvoiceKind, InvoiceStatus, Payment, PaymentMethod } from "@/lib/db/types";
import {
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  balanceCents,
  invoicePillClass,
  isOverdue,
  longDate,
  overdueDays,
} from "../invoice-state";
import {
  createPaymentLinkAction,
  exportInvoicesCsvAction,
  raiseFollowOnInvoiceAction,
  recordPaymentAction,
  voidInvoiceAction,
  xeroPayloadAction,
} from "../actions";
import { downloadCsv } from "../download";
import {
  PaymentLinkModal,
  RaiseInvoiceModal,
  RecordPaymentModal,
  VoidInvoiceModal,
} from "./invoice-modals";

export interface ScopeLine {
  description: string;
  qty: number;
  unit: string;
  /** Marked-up unit price — what the client was quoted. Never cost. */
  unitCents: number;
  amountCents: number;
}

export interface SiblingInvoice {
  id: string;
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  totalCents: number;
}

export interface InvoiceScreenProps {
  row: InvoiceRow;
  payments: Payment[];
  scope: ScopeLine[];
  scopeTotalCents: number;
  costCents: number;
  marginCents: number;
  unbilledCents: number;
  siblings: SiblingInvoice[];
  quoteId: string | null;
  jobId: string | null;
  gstOn: boolean;
  stripeReady: boolean;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  stripe: "Card · Stripe",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

type OpenModal = "payment" | "raise" | "void" | null;

function MetaRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="meta-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function InvoiceScreen({
  row,
  payments,
  scope,
  scopeTotalCents,
  costCents,
  marginCents,
  unbilledCents,
  siblings,
  quoteId,
  jobId,
  gstOn,
  stripeReady,
}: InvoiceScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<OpenModal>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string; amountCents: number } | null>(
    null,
  );
  const [busy, startTransition] = useTransition();

  const { invoice, client, quote } = row;
  const number = invoice.invoice_number ?? "Invoice";
  const balance = balanceCents(invoice, row.paid_cents);
  const overdue = isOverdue(invoice, row.paid_cents);
  const lateBy = overdueDays(invoice, row.paid_cents);
  const settled = invoice.status === "void" || balance <= 0;

  const recordPayment = (amountCents: number, method: PaymentMethod, reference: string) => {
    startTransition(async () => {
      const result = await recordPaymentAction({
        invoiceId: invoice.id, amountCents, method, reference,
      });
      if (!result.ok) return toast(result.error, "warning");
      setOpen(null);
      router.refresh();
      toast(`${money(amountCents)} recorded against ${number}`, "success", "check-circle");
    });
  };

  const makeLink = () => {
    startTransition(async () => {
      const result = await createPaymentLinkAction(invoice.id);
      if (!result.ok) return toast(result.error, "warning");
      setLink({ url: result.url, expiresAt: result.expiresAt, amountCents: result.amountCents });
    });
  };

  const voidIt = () => {
    startTransition(async () => {
      const result = await voidInvoiceAction(invoice.id);
      if (!result.ok) return toast(result.error, "warning");
      setOpen(null);
      router.refresh();
      toast(`${number} voided`, "info", "ban");
    });
  };

  const raise = (kind: Exclude<InvoiceKind, "deposit">, totalCents: number, dueAt: string) => {
    startTransition(async () => {
      const result = await raiseFollowOnInvoiceAction({
        fromInvoiceId: invoice.id, kind, totalCents, dueAt,
      });
      if (!result.ok) return toast(result.error, "warning");
      setOpen(null);
      router.push(`/invoices/${result.invoiceId}`);
    });
  };

  const exportCsv = () => {
    startTransition(async () => {
      const result = await exportInvoicesCsvAction([invoice.id]);
      if (!result.ok) return toast(result.error, "warning");
      downloadCsv(result.filename, result.csv);
      toast("Exported for Xero's invoice importer", "success", "download");
    });
  };

  const copyPayload = () => {
    startTransition(async () => {
      const result = await xeroPayloadAction(invoice.id);
      if (!result.ok) return toast(result.error, "warning");
      try {
        await navigator.clipboard.writeText(result.json);
        toast("Xero API payload copied", "success", "copy");
      } catch {
        toast("Couldn't reach the clipboard — use the CSV instead", "warning");
      }
    });
  };

  return (
    <div className="stack-6">
      <PageHeader
        crumbs={[{ label: "Invoices", href: "/invoices" }, { label: number }]}
        title={number}
        description={`${INVOICE_KIND_LABEL[invoice.kind]} · ${client?.name ?? "Unknown client"}`}
        actions={
          <>
            {!settled && (
              <Button variant="brand" icon="dollar-sign" onClick={() => setOpen("payment")} disabled={busy}>
                Record payment
              </Button>
            )}
            {!settled && (
              <Button
                variant="outline"
                icon="credit-card"
                onClick={makeLink}
                disabled={busy || !stripeReady}
                title={stripeReady ? undefined : "Stripe is not configured — set STRIPE_SECRET_KEY"}
              >
                Payment link
              </Button>
            )}
            {invoice.status !== "void" && row.paid_cents === 0 && (
              <Button variant="ghost" icon="ban" onClick={() => setOpen("void")} disabled={busy}>
                Void
              </Button>
            )}
          </>
        }
      />

      <div className="qview">
        <div className="qview__rail">
          <Card className="summary">
            <div className="summary__row">
              <span className="lbl">Invoice total</span>
              <span className="val">{money(invoice.total_cents)}</span>
            </div>
            <div className="summary__row">
              <span className="lbl">Received</span>
              <span className="val">{money(row.paid_cents)}</span>
            </div>
            <div className="summary__divider" />
            <div className="summary__total">
              <span className="lbl">Balance</span>
              <span className="val">{money(balance)}</span>
            </div>
            <div className="summary__gst-note">
              {invoice.status === "void"
                ? "Voided — nothing is owed on this invoice."
                : gstOn
                  ? "GST inclusive."
                  : "No GST — the business is not registered."}
            </div>
            <div style={{ marginTop: 14 }}>
              <span className={invoicePillClass(invoice.status, overdue)}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </span>
              {overdue && <div className="nudge nudge--critical">overdue {lateBy}d</div>}
            </div>
          </Card>

          <Card padding>
            <SectionLabel>Details</SectionLabel>
            <div style={{ marginTop: 8 }}>
              <MetaRow k="Kind" v={INVOICE_KIND_LABEL[invoice.kind]} />
              <MetaRow
                k="Quote"
                v={quoteId ? <Link href={`/quotes/${quoteId}`}>{quote?.quote_number ?? "View"}</Link> : "—"}
              />
              <MetaRow k="Job" v={jobId ? <Link href={`/jobs/${jobId}`}>View job</Link> : "—"} />
              <MetaRow k="Raised" v={longDate(invoice.sent_at ?? invoice.created_at)} />
              <MetaRow k="Due" v={invoice.due_at ? longDate(invoice.due_at) : "On receipt"} />
              <MetaRow k="Paid" v={invoice.paid_at ? longDate(invoice.paid_at) : "—"} />
              {invoice.stripe_payment_intent && (
                <MetaRow
                  k="Stripe"
                  v={<span className="mono" style={{ fontSize: 11 }}>{invoice.stripe_payment_intent}</span>}
                />
              )}
            </div>
          </Card>

          <Card padding>
            <SectionLabel>Xero</SectionLabel>
            <p style={{ margin: "8px 0 12px", font: "400 12px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
              An export, not a connection. Import the CSV, or paste the API body
              straight into Xero.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button variant="outline" icon="download" onClick={exportCsv} disabled={busy}>
                Download CSV
              </Button>
              <Button variant="ghost" icon="copy" onClick={copyPayload} disabled={busy}>
                Copy API payload
              </Button>
            </div>
          </Card>
        </div>

        <div className="qview__main stack-4">
          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">What this invoice covers</div>
                <div className="card-sub">
                  {quote?.quote_number
                    ? `Agreed scope on ${quote.quote_number}${quote.roof_type ? ` · ${quote.roof_type}` : ""}`
                    : "Raised directly against the job."}
                </div>
              </div>
            </div>

            {scope.length === 0 ? (
              <p style={{ margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
                No quote lines are attached to this invoice, so it bills as a
                single amount.
              </p>
            ) : (
              <>
                <table className="table table--cards">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th className="t-right" style={{ width: 84 }}>Qty</th>
                      <th className="t-right" style={{ width: 100 }}>Unit</th>
                      <th className="t-right" style={{ width: 110 }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scope.map((line, i) => (
                      <tr key={`${line.description}-${i}`} style={{ cursor: "default" }}>
                        <td data-label="Description">{line.description}</td>
                        <td className="num" data-label="Qty" style={{ fontSize: 12 }}>
                          {line.qty} {line.unit}
                        </td>
                        <td className="num" data-label="Unit" style={{ fontSize: 12 }}>
                          {money(line.unitCents)}
                        </td>
                        <td className="num" data-label="Amount" style={{ fontWeight: 600 }}>
                          {money(line.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="summary" style={{ padding: "14px 0 0" }}>
                  <div className="summary__row">
                    <span className="lbl">Agreed scope</span>
                    <span className="val">{money(scopeTotalCents)}</span>
                  </div>
                  <div className="summary__row">
                    <span className="lbl">
                      Cost / margin <InternalBadge />
                    </span>
                    <span className="val">
                      {money(costCents)} / {money(marginCents)}
                    </span>
                  </div>
                  <div className="summary__divider" />
                  <div className="summary__row">
                    <span className="lbl">This invoice</span>
                    <span className="val">{money(invoice.total_cents)}</span>
                  </div>
                </div>
              </>
            )}
          </Card>

          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Payments</div>
                <div className="card-sub">
                  {payments.length === 0
                    ? "Nothing received yet."
                    : `${money(row.paid_cents)} received across ${payments.length} payment${payments.length === 1 ? "" : "s"}.`}
                </div>
              </div>
              {!settled && (
                <Button variant="outline" size="sm" icon="plus" onClick={() => setOpen("payment")} disabled={busy}>
                  Record
                </Button>
              )}
            </div>

            {payments.length === 0 ? (
              <p style={{ margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
                Card payments land here automatically once Stripe confirms them.
                Bank transfers and cash are recorded by hand.
              </p>
            ) : (
              <table className="table table--cards">
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>Received</th>
                    <th style={{ width: 132 }}>Method</th>
                    <th>Reference</th>
                    <th className="t-right" style={{ width: 110 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} style={{ cursor: "default" }}>
                      <td className="mono" data-label="Received" style={{ fontSize: 12 }}>
                        {longDate(payment.received_at)}
                      </td>
                      <td data-label="Method">{METHOD_LABEL[payment.method]}</td>
                      <td
                        className="mono" data-label="Reference"
                        style={{ fontSize: 11.5, color: "var(--muted-foreground)", wordBreak: "break-all" }}
                      >
                        {payment.reference ?? "—"}
                      </td>
                      <td className="num" data-label="Amount" style={{ fontWeight: 600 }}>
                        {money(payment.amount_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Other invoices on this job</div>
                <div className="card-sub">
                  {unbilledCents > 0
                    ? `${money(unbilledCents)} of the agreed scope is not yet invoiced.`
                    : "The agreed scope is fully invoiced."}
                </div>
              </div>
              <Button variant="outline" size="sm" icon="receipt" onClick={() => setOpen("raise")} disabled={busy}>
                Raise another
              </Button>
            </div>

            {siblings.length === 0 ? (
              <p style={{ margin: 0, font: "400 13px/1.5 var(--font-sans)", color: "var(--muted-foreground)" }}>
                This is the only invoice raised against the job.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {siblings.map((sibling) => (
                  <Link key={sibling.id} href={`/invoices/${sibling.id}`} className="pb-item">
                    <span className="pb-item__desc">
                      {sibling.number ?? "—"} · {INVOICE_KIND_LABEL[sibling.kind]}
                    </span>
                    <span className={invoicePillClass(sibling.status, false)}>
                      {INVOICE_STATUS_LABEL[sibling.status]}
                    </span>
                    <span className="pb-item__price mono">{money(sibling.totalCents)}</span>
                    <Icon name="chevron-right" size={15} color="var(--muted-foreground)" />
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {open === "payment" && (
        <RecordPaymentModal
          outstandingCents={balance}
          busy={busy}
          onClose={() => setOpen(null)}
          onSubmit={recordPayment}
        />
      )}

      {open === "raise" && (
        <RaiseInvoiceModal
          suggestedCents={unbilledCents}
          busy={busy}
          onClose={() => setOpen(null)}
          onSubmit={raise}
        />
      )}

      {open === "void" && (
        <VoidInvoiceModal
          number={number}
          busy={busy}
          onClose={() => setOpen(null)}
          onConfirm={voidIt}
        />
      )}

      {link && (
        <PaymentLinkModal
          url={link.url}
          expiresAt={link.expiresAt}
          amountCents={link.amountCents}
          onClose={() => setLink(null)}
        />
      )}
    </div>
  );
}
