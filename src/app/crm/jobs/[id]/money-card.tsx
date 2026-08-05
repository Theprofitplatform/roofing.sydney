"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/crm/ui";
import { useToast } from "@/components/crm/toast";
import { depositCents, money } from "@/lib/money";
import type { InvoiceRow } from "@/lib/db/invoices";
import { raiseDeposit } from "../actions";
import { INVOICE_KIND_LABEL, INVOICE_PILL_CLASS, INVOICE_STATUS_LABEL } from "../job-view";

export function MoneyCard({
  jobId,
  quoteId,
  valueCents,
  invoices,
  depositEnabled,
  depositPct,
}: {
  jobId: string;
  quoteId: string;
  valueCents: number;
  invoices: InvoiceRow[];
  depositEnabled: boolean;
  depositPct: number;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const toast = useToast();

  const deposit = invoices.find((row) => row.invoice.kind === "deposit") ?? null;
  // The database is idempotent about this, but a button that stays live after
  // the invoice exists invites the operator to wonder whether it worked.
  const depositRaised = Boolean(deposit) || done;

  const raise = () => {
    startTransition(async () => {
      const result = await raiseDeposit(jobId, quoteId);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      if (!result.invoiceId) {
        toast("Deposits are switched off in settings — nothing was raised.", "warning");
        return;
      }
      setDone(true);
      toast("Deposit invoice raised", "success", "receipt");
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div className="card-title">Money</div>
      </div>

      {depositEnabled ? (
        <>
          <div className="meta-row">
            <span className="k">Deposit ({depositPct}%)</span>
            {/* Same basis the database uses: what the client accepted, not what was issued. */}
            <span className="v mono">{money(depositCents(valueCents, depositPct))}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Button
              variant={depositRaised ? "subtle" : "brand"}
              icon="receipt"
              className="btn--block"
              disabled={pending || depositRaised}
              onClick={raise}
            >
              {depositRaised ? "Deposit invoice raised" : pending ? "Raising…" : "Raise the deposit invoice"}
            </Button>
          </div>
        </>
      ) : (
        <p style={{ margin: 0, font: "400 12.5px/1.6 var(--font-sans)", color: "var(--muted-foreground)" }}>
          Deposits are switched off. Turn them on in <Link href="/settings">settings</Link> to bill one
          against an accepted quote.
        </p>
      )}

      <div className="section-label" style={{ marginTop: 18, marginBottom: 4 }}>Invoices</div>

      {invoices.length === 0 ? (
        <p style={{ margin: 0, font: "400 12.5px/1.6 var(--font-sans)", color: "var(--muted-foreground)" }}>
          Nothing billed against this job yet.
        </p>
      ) : (
        invoices.map(({ invoice, paid_cents }) => (
          <div className="meta-row" key={invoice.id}>
            <span className="k" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <Link href={`/invoices/${invoice.id}`} className="mono">
                {invoice.invoice_number ?? "Draft"}
              </Link>
              <span>{INVOICE_KIND_LABEL[invoice.kind]}</span>
            </span>
            <span
              className="v"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}
            >
              <span className="mono">
                {money(invoice.total_cents)}
                {paid_cents > 0 && paid_cents < invoice.total_cents && (
                  <span style={{ fontWeight: 400, color: "var(--muted-foreground)" }}>
                    {" "}
                    · {money(paid_cents)} in
                  </span>
                )}
              </span>
              <span className={`pill ${INVOICE_PILL_CLASS[invoice.status]}`}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </span>
            </span>
          </div>
        ))
      )}
    </Card>
  );
}
