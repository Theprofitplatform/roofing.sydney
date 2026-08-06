/* global React, PageHeader, Button, Icon, IconButton, StatusPill, Card, Modal, computeTotals, clientById, moneyShort, money, validUntil, daysBetween, useState, useMemo, useToast */

function KpiTile({ icon, label, value, sub, warn }) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--muted-foreground)", fontWeight: 600 }}>
        <Icon name={icon} size={14} /> {label}
      </div>
      <div className="tabular-nums" style={{ font: "700 24px/1.2 var(--font-sans)", marginTop: 8, letterSpacing: "-0.01em", color: warn ? "var(--status-warning)" : undefined }}>{value}</div>
      {sub && <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

/* Follow-up + expiry flags for a quote, driven by Settings. */
function quoteFlags(quote, settings) {
  const now = new Date();
  const daysLeft = daysBetween(now, validUntil(quote));
  const sentDays = quote.sent_at ? daysBetween(new Date(quote.sent_at), now) : null;
  const followDays = (settings && settings.follow_up_days) || 7;
  const needsFollowUp = quote.status === "sent" && !quote.viewed_at && sentDays != null && sentDays >= followDays;
  const expired = quote.status !== "accepted" && quote.status !== "draft" && daysLeft < 0;
  const expiring = !expired && quote.status !== "draft" && daysLeft >= 0 && daysLeft <= 7;
  return { daysLeft, sentDays, needsFollowUp, expiring, expired, attention: needsFollowUp || expiring || expired };
}

function TemplatePicker({ templates, onPick, onClose }) {
  return (
    <Modal title="New quote from template" sub="Pre-filled structure and quantities — edit them to match the site." onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map((tpl) => (
          <button key={tpl.id} className="tpl-item" onClick={() => onPick(tpl)}>
            <span className="tpl-item__icon"><Icon name={tpl.icon} size={17} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="tpl-item__name">{tpl.label}</span>
              <span className="tpl-item__sub">{tpl.sub}</span>
            </span>
            <span className="tpl-item__count mono">{tpl.line_items.length} lines</span>
            <Icon name="chevron-right" size={15} color="var(--muted-foreground)" />
          </button>
        ))}
        <button className="tpl-item" onClick={() => onPick(null)}>
          <span className="tpl-item__icon tpl-item__icon--blank"><Icon name="file" size={17} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="tpl-item__name">Blank quote</span>
            <span className="tpl-item__sub">Start from nothing</span>
          </span>
          <Icon name="chevron-right" size={15} color="var(--muted-foreground)" />
        </button>
      </div>
    </Modal>
  );
}

function QuotesScreen({ quotes, settings, onOpen, onNew, onNewFromTemplate, onDuplicate, onDelete }) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [tplOpen, setTplOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // quote to delete
  const toast = useToast();
  const templates = window.ARC_TEMPLATES || [];

  const enriched = useMemo(() => quotes.map((quote) => ({
    quote,
    client: clientById(quote.client_id),
    totals: computeTotals(quote),
    flags: quoteFlags(quote, settings),
  })), [quotes, settings]);

  const counts = {
    all: enriched.length,
    draft: enriched.filter((r) => r.quote.status === "draft").length,
    sent: enriched.filter((r) => r.quote.status === "sent" && !r.quote.viewed_at).length,
    viewed: enriched.filter((r) => !!r.quote.viewed_at).length,
    attention: enriched.filter((r) => r.flags.attention).length,
  };
  const TABS = [
    { id: "all", label: "All" },
    { id: "draft", label: "Drafts" },
    { id: "sent", label: "Sent" },
    { id: "viewed", label: "Viewed" },
    { id: "attention", label: "Attention" },
  ];

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enriched
      .filter(({ quote, flags }) => {
        if (tab === "draft") return quote.status === "draft";
        if (tab === "sent") return quote.status === "sent" && !quote.viewed_at;
        if (tab === "viewed") return !!quote.viewed_at;
        if (tab === "attention") return flags.attention;
        return true;
      })
      .filter(({ quote, client }) => {
        if (!term) return true;
        return (
          (client?.name || "").toLowerCase().includes(term) ||
          quote.quote_number.toLowerCase().includes(term) ||
          (client?.property_address || "").toLowerCase().includes(term) ||
          (quote.roof_type || "").toLowerCase().includes(term)
        );
      });
  }, [enriched, q, tab]);

  const drafts = counts.draft;
  const sentAll = enriched.filter((r) => r.quote.status === "sent").length;
  const totalValue = quotes.reduce((s, x) => s + computeTotals(x).total, 0);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—";

  const doDelete = () => {
    const quote = confirmDel;
    setConfirmDel(null);
    onDelete(quote.id);
    toast(`${quote.quote_number} deleted`, "info", "trash-2");
  };

  const Nudge = ({ flags }) => {
    if (flags.expired) return <div className="nudge nudge--critical">expired {Math.abs(flags.daysLeft)}d ago</div>;
    if (flags.needsFollowUp) return <div className="nudge nudge--warning">sent {flags.sentDays}d ago — no view</div>;
    if (flags.expiring) return <div className={`nudge ${flags.daysLeft <= 3 ? "nudge--critical" : "nudge--warning"}`}>{flags.daysLeft === 0 ? "expires today" : `expires in ${flags.daysLeft}d`}</div>;
    return null;
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Quotes"
        description="Every quote you've built, newest first."
        actions={<>
          <Button variant="outline" icon="layout-template" onClick={() => setTplOpen(true)}>From template</Button>
          <Button variant="brand" icon="plus" onClick={onNew}>New quote</Button>
        </>}
      />

      <div className="kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
        <KpiTile icon="pen-line" label="Open drafts" value={drafts} sub="Awaiting your finish" />
        <KpiTile icon="send" label="Sent to clients" value={sentAll} sub="Awaiting decision" />
        <KpiTile icon="dollar-sign" label="Value quoted" value={moneyShort(totalValue)} sub="Across all quotes" />
        <KpiTile icon="bell" label="Need attention" value={counts.attention} sub="Follow-ups & expiring" warn={counts.attention > 0} />
      </div>

      <div>
        <div className="list-controls">
          <div className="ftabs" role="tablist" aria-label="Filter quotes">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={`ftab ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
                {t.label}
                <span className="ftab__count">{counts[t.id]}</span>
              </button>
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={15} />
            <input placeholder="Search client, quote #, address…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search quotes" />
          </div>
        </div>

        {rows.length === 0 ? (
          <Card>
            <div className="empty">
              <span className="empty__icon"><Icon name={q || tab !== "all" ? "file-search" : "file-plus"} size={24} /></span>
              <h3>{q ? "No matching quotes" : tab !== "all" ? "Nothing here" : "Create your first quote"}</h3>
              <p>{q ? "Try a different client name, quote number, or address." : tab === "attention" ? "No follow-ups or expiring quotes — the pipeline is healthy." : tab !== "all" ? "No quotes with this status yet." : "Start from a template — it cuts a ten-minute build down to editing quantities."}</p>
              {!q && tab === "all" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  {templates.map((tpl) => (
                    <Button key={tpl.id} variant="outline" icon={tpl.icon} onClick={() => onNewFromTemplate(tpl)}>{tpl.label}</Button>
                  ))}
                  <Button variant="brand" icon="plus" onClick={onNew}>Blank quote</Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Quote #</th>
                  <th>Client</th>
                  <th>Job / Property</th>
                  <th className="t-right" style={{ width: 120 }}>Total</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 84 }}>Date</th>
                  <th style={{ width: 72 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ quote, client, totals, flags }) => (
                  <tr key={quote.id} onClick={() => onOpen(quote.id)}>
                    <td className="mono" data-label="Quote" style={{ fontSize: 12.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{quote.quote_number}</td>
                    <td data-label="Client" style={{ fontWeight: 600 }}>{client?.name || "—"}</td>
                    <td data-label="Job" className="cell-stack">
                      <div style={{ fontWeight: 500 }}>{quote.roof_type || "—"}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>{client?.property_address || ""}</div>
                    </td>
                    <td className="num" data-label="Total" style={{ fontWeight: 600, fontSize: 13.5 }}>{money(totals.total)}</td>
                    <td data-label="Status">
                      <StatusPill status={quote.viewed_at ? "viewed" : quote.status} />
                      <Nudge flags={flags} />
                    </td>
                    <td className="mono" data-label="Date" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{fmtDate(quote.sent_at || quote.created_at)}</td>
                    <td className="t-right cell-action" data-label="" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "inline-flex", gap: 2 }}>
                        <IconButton icon="copy" size={14} title="Duplicate quote" onClick={() => onDuplicate(quote.id)} />
                        <IconButton icon="trash-2" size={14} title="Delete quote" onClick={() => setConfirmDel(quote)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {tplOpen && (
        <TemplatePicker templates={templates} onClose={() => setTplOpen(false)}
          onPick={(tpl) => { setTplOpen(false); tpl ? onNewFromTemplate(tpl) : onNew(); }} />
      )}

      {confirmDel && (
        <Modal title={`Delete ${confirmDel.quote_number}?`} sub="This removes the quote permanently. Clients and the price book are unaffected." onClose={() => setConfirmDel(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="danger" icon="trash-2" onClick={doDelete}>Delete quote</Button>
          </>}>
          <p style={{ margin: 0, color: "var(--muted-foreground)", font: "400 13px/1.5 var(--font-sans)" }}>
            {clientById(confirmDel.client_id)?.name || "—"} · {confirmDel.roof_type || "Roofing works"} · {money(computeTotals(confirmDel).total)}
            {confirmDel.status !== "draft" && " — this quote has already been sent to the client."}
          </p>
        </Modal>
      )}
    </div>
  );
}

Object.assign(window, { QuotesScreen, quoteFlags });
