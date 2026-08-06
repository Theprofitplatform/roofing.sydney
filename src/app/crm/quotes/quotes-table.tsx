"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  QuoteStatusPill,
} from "@/components/crm/ui";
import { money, moneyShort } from "@/lib/money";
import { nudgeLevel, nudgeText, quoteFlags, type QuoteFlags } from "@/lib/quote-state";
import type { QuoteListRow } from "@/lib/db/quotes";
import { duplicateQuote, removeQuote } from "./actions";
import { formatDay, quoteLabel, quoteTotalCents } from "./helpers";

export interface TemplateChoice {
  id: string;
  label: string;
  sub: string | null;
  icon: string;
  lines: number;
}

type TabId = "all" | "draft" | "sent" | "viewed" | "attention";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed" },
  { id: "attention", label: "Attention" },
];

function KpiTile({
  icon,
  label,
  value,
  sub,
  warn,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub: string;
  warn?: boolean;
}) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          fontSize: 11.5,
          color: "var(--muted-foreground)",
          fontWeight: 600,
        }}
      >
        <Icon name={icon} size={14} /> {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          font: "700 24px/1.2 var(--font-sans)",
          marginTop: 8,
          letterSpacing: "-0.01em",
          color: warn ? "var(--status-warning)" : undefined,
        }}
      >
        {value}
      </div>
      <div
        style={{
          font: "400 11.5px/1.3 var(--font-sans)",
          color: "var(--muted-foreground)",
          marginTop: 5,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function Nudge({ flags }: { flags: QuoteFlags }) {
  const text = nudgeText(flags);
  if (!text) return null;
  return <div className={`nudge nudge--${nudgeLevel(flags)}`}>{text}</div>;
}

export function QuotesTable({
  rows,
  followUpDays,
  templates,
}: {
  rows: QuoteListRow[];
  followUpDays: number;
  templates: TemplateChoice[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    quote: QuoteListRow["quote"];
    client: QuoteListRow["client"];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const enriched = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        total: quoteTotalCents(row.quote, row.items),
        flags: quoteFlags(row.quote, { follow_up_days: followUpDays }),
      })),
    [rows, followUpDays],
  );

  const counts: Record<TabId, number> = {
    all: enriched.length,
    draft: enriched.filter((r) => r.quote.status === "draft").length,
    sent: enriched.filter((r) => r.quote.status === "sent" && !r.quote.viewed_at).length,
    viewed: enriched.filter((r) => !!r.quote.viewed_at).length,
    attention: enriched.filter((r) => r.flags.attention).length,
  };

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return enriched
      .filter(({ quote, flags }) => {
        if (tab === "draft") return quote.status === "draft";
        if (tab === "sent") return quote.status === "sent" && !quote.viewed_at;
        if (tab === "viewed") return !!quote.viewed_at;
        if (tab === "attention") return flags.attention;
        return true;
      })
      .filter(({ quote, client }) => {
        if (!needle) return true;
        return [client.name, quote.quote_number, client.property_address, quote.roof_type]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle));
      });
  }, [enriched, term, tab]);

  const valueQuoted = enriched.reduce((sum, row) => sum + row.total, 0);
  const sentCount = enriched.filter((r) => r.quote.status === "sent").length;

  const onDuplicate = async (quoteId: string) => {
    setBusy(true);
    const result = await duplicateQuote(quoteId);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    toast("Duplicated as a new draft", "success", "copy");
    router.push(`/quotes/${result.id}/edit`);
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    const label = quoteLabel(confirmDelete.quote);
    setBusy(true);
    const result = await removeQuote(confirmDelete.quote.id);
    setBusy(false);
    setConfirmDelete(null);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    toast(`${label} deleted`, "info", "trash-2");
    router.refresh();
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Quotes"
        description="Every quote you've built, newest first."
        actions={
          <>
            <Button
              variant="outline"
              icon="layout-template"
              onClick={() => setTemplatesOpen(true)}
              disabled={templates.length === 0}
            >
              From template
            </Button>
            <Button variant="brand" icon="plus" onClick={() => router.push("/quotes/new")}>
              New quote
            </Button>
          </>
        }
      />

      <div
        className="kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        <KpiTile icon="pen-line" label="Open drafts" value={counts.draft} sub="Awaiting your finish" />
        <KpiTile icon="send" label="Sent to clients" value={sentCount} sub="Awaiting decision" />
        <KpiTile
          icon="dollar-sign"
          label="Value quoted"
          value={moneyShort(valueQuoted)}
          sub="Across all quotes"
        />
        <KpiTile
          icon="bell"
          label="Need attention"
          value={counts.attention}
          sub="Follow-ups & expiring"
          warn={counts.attention > 0}
        />
      </div>

      <div>
        <div className="list-controls">
          <div className="ftabs" role="tablist" aria-label="Filter quotes">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
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
              placeholder="Search client, quote #, address…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search quotes"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={term || tab !== "all" ? "file-search" : "file-plus"}
              title={
                term ? "No matching quotes" : tab !== "all" ? "Nothing here" : "Create your first quote"
              }
              actions={
                !term && tab === "all" ? (
                  <div
                    style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}
                  >
                    {templates.map((tpl) => (
                      <Button
                        key={tpl.id}
                        variant="outline"
                        icon={tpl.icon}
                        onClick={() => router.push(`/quotes/new?template=${tpl.id}`)}
                      >
                        {tpl.label}
                      </Button>
                    ))}
                    <Button variant="brand" icon="plus" onClick={() => router.push("/quotes/new")}>
                      Blank quote
                    </Button>
                  </div>
                ) : null
              }
            >
              {term
                ? "Try a different client name, quote number, or address."
                : tab === "attention"
                  ? "No follow-ups or expiring quotes — the pipeline is healthy."
                  : tab !== "all"
                    ? "No quotes with this status yet."
                    : "Start from a template — it cuts a ten-minute build down to editing quantities."}
            </EmptyState>
          </Card>
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Quote #</th>
                  <th>Client</th>
                  <th>Job / Property</th>
                  <th className="t-right" style={{ width: 120 }}>
                    Total
                  </th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 84 }}>Date</th>
                  <th style={{ width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ quote, client, total, flags }) => (
                  <tr key={quote.id} onClick={() => router.push(`/quotes/${quote.id}`)}>
                    <td
                      className="mono"
                      data-label="Quote"
                      style={{
                        fontSize: 12.5,
                        color: "var(--muted-foreground)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {quoteLabel(quote)}
                    </td>
                    <td data-label="Client" style={{ fontWeight: 600 }}>
                      {client.name || "—"}
                    </td>
                    <td data-label="Job" className="cell-stack">
                      <div style={{ fontWeight: 500 }}>{quote.roof_type || "—"}</div>
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--muted-foreground)",
                          marginTop: 2,
                        }}
                      >
                        {client.property_address ?? ""}
                      </div>
                    </td>
                    <td className="num" data-label="Total" style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {money(total)}
                    </td>
                    <td data-label="Status">
                      <QuoteStatusPill quote={quote} />
                      <Nudge flags={flags} />
                    </td>
                    <td
                      className="mono"
                      data-label="Date"
                      style={{ fontSize: 12, color: "var(--muted-foreground)" }}
                    >
                      {formatDay(quote.sent_at ?? quote.created_at)}
                    </td>
                    <td
                      className="t-right cell-action"
                      data-label=""
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: "inline-flex", gap: 2 }}>
                        <IconButton
                          icon="copy"
                          size={14}
                          title="Duplicate quote"
                          disabled={busy}
                          onClick={() => void onDuplicate(quote.id)}
                        />
                        <IconButton
                          icon="trash-2"
                          size={14}
                          title="Delete quote"
                          disabled={busy}
                          onClick={() => setConfirmDelete({ quote, client })}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {templatesOpen && (
        <Modal
          title="New quote from template"
          sub="Pre-filled structure and quantities — edit them to match the site."
          onClose={() => setTemplatesOpen(false)}
          maxWidth={480}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="tpl-item"
                onClick={() => router.push(`/quotes/new?template=${tpl.id}`)}
              >
                <span className="tpl-item__icon">
                  <Icon name={tpl.icon} size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="tpl-item__name">{tpl.label}</span>
                  <span className="tpl-item__sub">{tpl.sub}</span>
                </span>
                <span className="tpl-item__count mono">{tpl.lines} lines</span>
                <Icon name="chevron-right" size={15} color="var(--muted-foreground)" />
              </button>
            ))}
            <button type="button" className="tpl-item" onClick={() => router.push("/quotes/new")}>
              <span className="tpl-item__icon tpl-item__icon--blank">
                <Icon name="file" size={17} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="tpl-item__name">Blank quote</span>
                <span className="tpl-item__sub">Start from nothing</span>
              </span>
              <Icon name="chevron-right" size={15} color="var(--muted-foreground)" />
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={`Delete ${quoteLabel(confirmDelete.quote)}?`}
          sub="This removes the quote permanently. Clients and the price book are unaffected."
          onClose={() => setConfirmDelete(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" icon="trash-2" disabled={busy} onClick={() => void onDelete()}>
                Delete quote
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            {confirmDelete.client.name} · {confirmDelete.quote.roof_type || "Roofing works"}
            {confirmDelete.quote.sent_at &&
              " — this quote has already been sent to the client, and deleting it destroys the record of what they received."}
          </p>
        </Modal>
      )}
    </div>
  );
}
