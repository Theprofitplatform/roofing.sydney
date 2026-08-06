"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Checkbox, EmptyState, PageHeader } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { money, moneyShort } from "@/lib/money";
import type { InvoiceRow } from "@/lib/db/invoices";
import {
  INVOICE_KIND_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_TABS,
  balanceCents,
  businessToday,
  invoicePillClass,
  isOverdue,
  matchesTab,
  overdueDays,
  shortDate,
  type InvoiceTab,
} from "./invoice-state";
import { exportAcceptedQuotesCsvAction, exportInvoicesCsvAction } from "./actions";
import { downloadCsv } from "./download";

function KpiTile({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 11.5, color: "var(--muted-foreground)", fontWeight: 600,
        }}
      >
        <Icon name={icon} size={14} /> {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          font: "700 24px/1.2 var(--font-sans)", marginTop: 8, letterSpacing: "-0.01em",
          color: warn ? "var(--status-warning)" : undefined,
        }}
      >
        {value}
      </div>
      <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 5 }}>
        {sub}
      </div>
    </div>
  );
}

export function InvoicesScreen({ rows }: { rows: InvoiceRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<InvoiceTab>("all");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [busy, startTransition] = useTransition();

  // One clock for the whole render, so a row cannot be overdue in one column and
  // on time in the next.
  const now = useMemo(() => new Date(), []);

  const enriched = useMemo(
    () =>
      rows.map((row) => ({
        row,
        balance: balanceCents(row.invoice, row.paid_cents),
        overdue: isOverdue(row.invoice, row.paid_cents, now),
        lateBy: overdueDays(row.invoice, row.paid_cents, now),
      })),
    [rows, now],
  );

  const counts = useMemo(() => {
    const out: Record<InvoiceTab, number> = {
      all: 0, sent: 0, part_paid: 0, paid: 0, overdue: 0, void: 0,
    };
    for (const { row } of enriched) {
      for (const t of INVOICE_TABS) {
        if (matchesTab(t.id, row.invoice, row.paid_cents, now)) out[t.id] += 1;
      }
    }
    return out;
  }, [enriched, now]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return enriched
      .filter(({ row }) => matchesTab(tab, row.invoice, row.paid_cents, now))
      .filter(({ row }) => {
        if (!needle) return true;
        return [
          row.invoice.invoice_number,
          row.client?.name,
          row.quote?.quote_number,
          row.quote?.roof_type,
        ]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      });
  }, [enriched, tab, term, now]);

  const kpis = useMemo(() => {
    const live = enriched.filter(({ row }) => row.invoice.status !== "void");
    const outstanding = live.reduce((sum, r) => sum + r.balance, 0);
    const overdue = live.filter((r) => r.overdue).reduce((sum, r) => sum + r.balance, 0);
    const awaiting = live.filter((r) => r.balance > 0).length;

    // The business's month, not the runtime's. This component is server-rendered
    // and then hydrated: a UTC server and a Sydney browser disagree about which
    // month it is for ten hours of every first-of-the-month, and the figure
    // would visibly change under the operator on reload.
    const month = businessToday(now).slice(0, 7);
    const paidThisMonth = live
      .filter(({ row }) => {
        const paidAt = row.invoice.paid_at;
        return paidAt !== null && businessToday(new Date(paidAt)).startsWith(month);
      })
      .reduce((sum, { row }) => sum + row.invoice.total_cents, 0);

    return { outstanding, overdue, awaiting, paidThisMonth, month };
  }, [enriched, now]);

  // Built from the same Sydney-anchored month string for the same reason.
  const monthLabel = new Date(`${kpis.month}-01T00:00:00Z`).toLocaleDateString("en-AU", {
    timeZone: "UTC",
    month: "long",
  });

  const allShownSelected = visible.length > 0 && visible.every(({ row }) => selected.has(row.invoice.id));

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allShownSelected) visible.forEach(({ row }) => next.delete(row.invoice.id));
      else visible.forEach(({ row }) => next.add(row.invoice.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportSelected = () => {
    startTransition(async () => {
      const result = await exportInvoicesCsvAction([...selected]);
      if (!result.ok) return toast(result.error, "warning");
      downloadCsv(result.filename, result.csv);
      toast(`${selected.size} invoice${selected.size === 1 ? "" : "s"} exported for Xero`, "success", "download");
    });
  };

  const exportQuotes = () => {
    startTransition(async () => {
      const result = await exportAcceptedQuotesCsvAction();
      if (!result.ok) return toast(result.error, "warning");
      downloadCsv(result.filename, result.csv);
      toast("Accepted quotes exported for Xero", "success", "download");
    });
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Invoices"
        description="Deposits, progress claims and final invoices — and what is still owed on each."
        actions={
          <>
            <Button variant="outline" icon="download" onClick={exportQuotes} disabled={busy}>
              Export accepted quotes
            </Button>
            <Button
              variant="brand"
              icon="download"
              onClick={exportSelected}
              disabled={busy || selected.size === 0}
            >
              Export {selected.size > 0 ? `${selected.size} ` : ""}to Xero
            </Button>
          </>
        }
      />

      <div
        className="kpi-grid"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}
      >
        <KpiTile
          icon="receipt" label="Outstanding"
          value={moneyShort(kpis.outstanding)}
          sub={`${kpis.awaiting} invoice${kpis.awaiting === 1 ? "" : "s"} awaiting payment`}
        />
        <KpiTile
          icon="alert-triangle" label="Overdue"
          value={moneyShort(kpis.overdue)}
          sub="Past the due date and unpaid"
          warn={kpis.overdue > 0}
        />
        <KpiTile
          icon="check-circle" label="Paid this month"
          value={moneyShort(kpis.paidThisMonth)}
          sub={`Settled in full since 1 ${monthLabel}`}
        />
        <KpiTile
          icon="dollar-sign" label="Invoiced"
          value={moneyShort(rows.reduce((sum, r) => sum + r.invoice.total_cents, 0))}
          sub="Across every invoice raised"
        />
      </div>

      <div>
        <div className="list-controls">
          <div className="ftabs" role="tablist" aria-label="Filter invoices">
            {INVOICE_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`ftab ${tab === t.id ? "is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span className="ftab__count">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={15} />
            <input
              placeholder="Search invoice #, client, quote…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search invoices"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={rows.length === 0 ? "receipt" : "file-search"}
              title={rows.length === 0 ? "No invoices yet" : "Nothing here"}
            >
              {rows.length === 0
                ? "Open a job against an accepted quote and raise the deposit from there. Progress claims and the final invoice are raised from an existing invoice."
                : "No invoices match this filter. Try another tab, or clear the search."}
            </EmptyState>
          </Card>
        ) : (
          <div className="table-wrap">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th style={{ width: 38 }}>
                    <Checkbox on={allShownSelected} onChange={toggleAll} />
                  </th>
                  <th style={{ width: 128 }}>Invoice #</th>
                  <th>Client</th>
                  <th>For</th>
                  <th className="t-right" style={{ width: 110 }}>Total</th>
                  <th className="t-right" style={{ width: 110 }}>Balance</th>
                  <th style={{ width: 148 }}>Status</th>
                  <th style={{ width: 84 }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, balance, overdue, lateBy }) => (
                  <tr
                    key={row.invoice.id}
                    onClick={() => router.push(`/invoices/${row.invoice.id}`)}
                  >
                    <td data-label="" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        on={selected.has(row.invoice.id)}
                        onChange={() => toggleOne(row.invoice.id)}
                      />
                    </td>
                    <td
                      className="mono" data-label="Invoice"
                      style={{ fontSize: 12.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
                    >
                      {row.invoice.invoice_number ?? "—"}
                    </td>
                    <td data-label="Client" style={{ fontWeight: 600 }}>
                      {row.client?.name ?? "—"}
                    </td>
                    <td data-label="For" className="cell-stack">
                      <div style={{ fontWeight: 500 }}>{INVOICE_KIND_LABEL[row.invoice.kind]}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>
                        {row.quote?.quote_number ?? "—"}
                        {row.quote?.roof_type ? ` · ${row.quote.roof_type}` : ""}
                      </div>
                    </td>
                    <td className="num" data-label="Total" style={{ fontSize: 13 }}>
                      {money(row.invoice.total_cents)}
                    </td>
                    <td className="num" data-label="Balance" style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {balance === 0 ? "—" : money(balance)}
                    </td>
                    <td data-label="Status">
                      <span className={invoicePillClass(row.invoice.status, overdue)}>
                        {INVOICE_STATUS_LABEL[row.invoice.status]}
                      </span>
                      {overdue && (
                        <div className="nudge nudge--critical">
                          overdue {lateBy}d
                        </div>
                      )}
                    </td>
                    <td
                      className="mono" data-label="Due"
                      style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                    >
                      {shortDate(row.invoice.due_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
