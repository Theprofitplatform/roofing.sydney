/* global React, PageHeader, Button, Icon, IconButton, StatusPill, Card, Modal, QuotePDF, Field, Input, Textarea, money, moneyShort, computeTotals, clientById, downloadQuotePdf, useState, useEffect, useRef, useToast */

function StatusTimeline({ quote }) {
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : null;
  const steps = [
    { key: "draft", label: "Created", date: quote.created_at, icon: "pen-line" },
    { key: "sent", label: "Sent to client", date: quote.sent_at, icon: "send" },
    { key: "viewed", label: "Viewed by client", date: quote.viewed_at, icon: "eye" },
  ];
  return (
    <div className="timeline">
      {steps.map((s, i) => {
        const done = !!s.date;
        return (
          <div className={`timeline__step ${done ? "is-done" : ""} ${i === steps.length - 1 ? "is-last" : ""}`} key={s.key}>
            <span className="timeline__dot"><Icon name={done ? s.icon : "circle"} size={done ? 11 : 8} strokeWidth={done ? 2.4 : 2} /></span>
            <div className="timeline__body">
              <span className="timeline__label">{s.label}</span>
              <span className="timeline__date">{fmt(s.date) || (done ? "" : "—")}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PdfViewport({ quote }) {
  const stageRef = useRef(null);
  const pdfRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(1123);

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const avail = stage.clientWidth - 56;
      const s = Math.max(0.34, Math.min(1, avail / 794));
      setScale(s);
      if (pdfRef.current) setH(pdfRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stageRef.current) ro.observe(stageRef.current);
    const t = setTimeout(measure, 120);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [quote]);

  return (
    <div className="pdf-stage" ref={stageRef}>
      <div style={{ width: 794 * scale, height: h * scale }}>
        <div ref={pdfRef} style={{ width: 794 }}>
          <QuotePDF quote={quote} scale={scale} />
        </div>
      </div>
    </div>
  );
}

function EmailModal({ quote, onClose, onSent }) {
  const b = window.ARC_BUSINESS;
  const client = clientById(quote.client_id) || {};
  const t = computeTotals(quote);
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [subject, setSubject] = useState(`Your quote ${quote.quote_number} — ${b.business_name}`);
  const [body, setBody] = useState(
    `Hi ${client.name?.split(" ")[0] || "there"},\n\n` +
    `Thanks for having us out to ${client.property_address || "your property"}. ` +
    `Please find attached our quote ${quote.quote_number} for ${quote.roof_type || "the roofing works"}, totalling ${moneyShort(t.total)}.\n\n` +
    `The quote is valid for ${quote.valid_days} days. If you'd like to proceed, sign the acceptance section and reply to this email, or give me a call.\n\n` +
    `Kind regards,\n${b.owner_name}\n${b.business_name}\n${b.phone}`
  );

  const send = () => {
    setSending(true);
    setTimeout(() => { onSent(); }, 900);
  };

  const copyText = () => {
    const text = `To: ${client.email}\nSubject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(text)
      .then(() => toast("Email text copied to clipboard", "success", "check-circle"))
      .catch(() => toast("Couldn't copy — select and copy manually", "warning", "alert-triangle"));
  };

  return (
    <Modal
      title="Email quote to client"
      sub={`Sent from ${b.email}`}
      onClose={sending ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" icon="clipboard" onClick={copyText} disabled={sending}>Copy text</Button>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="brand" icon={sending ? "loader-2" : "send"} onClick={send} disabled={sending} className={sending ? "is-spinning" : ""}>
            {sending ? "Sending…" : "Send email"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="To"><Input value={client.email} readOnly /></Field>
        <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><Textarea style={{ minHeight: 168, lineHeight: 1.55 }} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="attach">
          <span className="attach__icon"><Icon name="file-text" size={17} /></span>
          <div style={{ flex: 1 }}>
            <div className="attach__name">{quote.quote_number}.pdf</div>
            <div className="attach__size">Branded quote · A4 · auto-attached</div>
          </div>
          <Icon name="paperclip" size={15} color="var(--muted-foreground)" />
        </div>
      </div>
    </Modal>
  );
}

function ViewScreen({ quote, onEdit, onBack, onEmail, onDuplicate, onDelete, emailOpen, onCloseEmail, onSent }) {
  const client = clientById(quote.client_id) || {};
  const t = computeTotals(quote);
  const toast = useToast();
  const [confirmDel, setConfirmDel] = useState(false);
  const issued = quote.sent_at || quote.created_at;
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const download = () => {
    if (downloadQuotePdf(quote.quote_number)) toast("Print window opened — choose “Save as PDF”", "success", "download");
    else toast("Couldn't open print window — allow pop-ups for this page", "warning", "alert-triangle");
  };

  return (
    <div className="stack-6">
      <PageHeader
        crumbs={[{ label: "Quotes", onClick: onBack }, { label: quote.quote_number }]}
        title={<span style={{ display: "inline-flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>{quote.quote_number}<StatusPill status={quote.viewed_at ? "viewed" : quote.status} /></span>}
        description={`${quote.roof_type || "Roofing works"} · ${client.name}`}
        actions={
          <>
            <IconButton icon="trash-2" title="Delete quote" onClick={() => setConfirmDel(true)} />
            <Button variant="ghost" icon="copy" onClick={onDuplicate}>Duplicate</Button>
            <Button variant="outline" icon="pen-line" onClick={onEdit}>Edit</Button>
            <Button variant="outline" icon="download" onClick={download}>Download</Button>
            <Button variant="brand" icon="send" onClick={onEmail} disabled={!client.email}>Email to client</Button>
          </>
        }
      />

      <div className="qview">
        <div className="qview__rail">
          <Card padding>
            <div className="section-label" style={{ marginBottom: 12 }}>Status</div>
            <StatusTimeline quote={quote} />
          </Card>

          <Card padding>
            <div className="section-label" style={{ marginBottom: 6 }}>Details</div>
            <div className="meta-row"><span className="k">Client</span><span className="v">{client.name}</span></div>
            <div className="meta-row"><span className="k">Phone</span><span className="v mono">{client.phone || "—"}</span></div>
            <div className="meta-row"><span className="k">Email</span><span className="v" style={{ color: client.email ? undefined : "var(--status-warning)" }}>{client.email || "None on file"}</span></div>
            <div className="meta-row"><span className="k">Property</span><span className="v" style={{ maxWidth: 170, textAlign: "right", whiteSpace: "normal" }}>{client.property_address}</span></div>
            <div className="meta-row"><span className="k">Valid for</span><span className="v">{quote.valid_days} days</span></div>
          </Card>

          <Card padding>
            <div className="section-label" style={{ marginBottom: 10 }}>Totals</div>
            <div className="summary__row"><span className="lbl">Subtotal</span><span className="val">{money(t.subtotal)}</span></div>
            <div className="summary__row"><span className="lbl">Margin ({quote.margin_pct}%) <span className="int-badge" title="Internal only — the client PDF shows sell prices; your margin is never printed."><Icon name="eye-off" size={10} strokeWidth={2.4} />internal</span></span><span className="val">{money(t.margin)}</span></div>
            {quote.gst_enabled && <div className="summary__row"><span className="lbl">GST (10%)</span><span className="val">{money(t.gst)}</span></div>}
            <div className="summary__divider" />
            <div className="summary__total"><span className="lbl">Total</span><span className="val">{moneyShort(t.total)}</span></div>
          </Card>

          {quote.status === "draft" && (
            <div style={{ font: "400 12px/1.5 var(--font-sans)", color: "var(--muted-foreground)", padding: "0 4px" }}>
              <Icon name="info" size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
              This quote is a draft. Emailing it will mark it as sent.
            </div>
          )}
        </div>

        <div className="qview__main">
          <div className="pdf-toolbar">
            <span className="section-label">Quote PDF preview</span>
            <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>A4 · {quote.show_breakdown ? "itemised" : "single line"} · {quote.gst_enabled ? "inc GST" : "no GST"}</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" icon="download" onClick={download}>Download PDF</Button>
          </div>
          <PdfViewport quote={quote} />
        </div>
      </div>

      {emailOpen && client.email && (
        <EmailModal quote={quote} onClose={onCloseEmail} onSent={onSent} />
      )}

      {confirmDel && (
        <Modal title={`Delete ${quote.quote_number}?`} sub="This removes the quote permanently. The client record is unaffected." onClose={() => setConfirmDel(false)}
          footer={<>
            <Button variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button variant="danger" icon="trash-2" onClick={() => { setConfirmDel(false); onDelete(quote.id); toast(`${quote.quote_number} deleted`, "info", "trash-2"); }}>Delete quote</Button>
          </>}>
          <p style={{ margin: 0, color: "var(--muted-foreground)", font: "400 13px/1.5 var(--font-sans)" }}>
            {client.name} · {quote.roof_type || "Roofing works"} · {money(t.total)}
            {quote.status !== "draft" && " — this quote has already been sent to the client."}
          </p>
        </Modal>
      )}
    </div>
  );
}

window.ViewScreen = ViewScreen;
