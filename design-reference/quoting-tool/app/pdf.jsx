/* global React, Icon, RoofMark, money, computeTotals, clientById, depositCents */

function QuotePDF({ quote, scale = 1 }) {
  const b = window.ARC_BUSINESS;
  const client = clientById(quote.client_id) || {};
  const t = computeTotals(quote);
  const materials = (quote.line_items || []).filter((i) => i.kind === "material");
  const labour = (quote.line_items || []).filter((i) => i.kind === "labour");
  const modern = quote.pdf_layout === "modern";

  // Client-facing prices are marked up by the quote margin so the printed line
  // items reconcile with the Total — clients never see internal cost prices.
  const marginMult = 1 + (parseFloat(quote.margin_pct) || 0) / 100;
  const dispUnitCents = (it) => Math.round((it.unit_cost_cents || 0) * marginMult);
  const dispAmountCents = (it) => Math.round(dispUnitCents(it) * (parseFloat(it.qty) || 0));
  const lineTotal = (it) => money(dispAmountCents(it));
  // Totals derived from the displayed (marked-up) line amounts so the table sums exactly.
  const dispSubtotal = quote.show_breakdown
    ? (quote.line_items || []).reduce((s, it) => s + dispAmountCents(it), 0)
    : t.preGst;
  const dispGst = quote.gst_enabled ? Math.round(dispSubtotal * 0.10) : 0;
  const dispTotal = dispSubtotal + dispGst;

  const orgTag = [b.legal_name && b.legal_name.replace(b.business_name, "").trim(), b.address].filter(Boolean).join(" \u00b7 ");
  const depositPct = b.deposit_enabled ? (parseFloat(b.deposit_pct) || 0) : 0;
  const depositDue = Math.round(dispTotal * depositPct / 100);
  const logoImg = b.logo_data ? <img src={b.logo_data} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} /> : null;

  const issued = quote.sent_at || quote.created_at || new Date().toISOString();
  const issuedDate = new Date(issued);
  const fmt = (d) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const validUntil = new Date(issuedDate.getTime() + (quote.valid_days || 30) * 86400000);

  const ItemTable = ({ caption, rows }) => (
    <table className="pdf-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th style={{ width: "52%" }}>Description</th>
          <th className="r">Qty</th>
          <th>Unit</th>
          <th className="r">Unit price</th>
          <th className="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((it, i) => (
          <tr key={i}>
            <td className="desc">{it.description}</td>
            <td className="r num">{parseFloat(it.qty)}</td>
            <td>{it.unit}</td>
            <td className="r num">{money(dispUnitCents(it))}</td>
            <td className="r num">{lineTotal(it)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const orgLines = (
    <>
      <div className="lic">Licence {b.licence_no}</div>
      <div>ABN {b.abn} · ACN {b.acn}</div>
      <div>{b.phone}</div>
      <div>{b.email}</div>
    </>
  );

  return (
    <div className={`pdf ${modern ? "pdf--modern" : ""}`} style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
      {/* Header */}
      {modern ? (
        <div className="pdf__band">
          <div className="pdf-logo">
            <span className="pdf-logo__mark pdf-logo__mark--ghost">{logoImg || <RoofMark size={26} />}</span>
            <div>
              <div className="pdf-logo__name">{b.business_name}</div>
              <div className="pdf-logo__tag pdf-logo__tag--on">{orgTag}</div>
            </div>
          </div>
          <div className="pdf__org pdf__org--on">{orgLines}</div>
        </div>
      ) : (
        <div className="pdf__head">
          <div className="pdf-logo">
            <span className="pdf-logo__mark">{logoImg || <RoofMark size={26} />}</span>
            <div>
              <div className="pdf-logo__name">{b.business_name}</div>
              <div className="pdf-logo__tag">{orgTag}</div>
            </div>
          </div>
          <div className="pdf__org">{orgLines}</div>
        </div>
      )}

      {/* Title + meta */}
      <div className="pdf__title-row">
        <div className="pdf__title">Quotation</div>
        <div className="pdf__meta">
          <div><b>{quote.quote_number}</b></div>
          <div>Issued {fmt(issuedDate)}</div>
          <div>Valid for {quote.valid_days} days — until {fmt(validUntil)}</div>
        </div>
      </div>

      {/* Parties */}
      <div className="pdf__parties">
        <div>
          <div className="pdf__party-label">Prepared for</div>
          <div className="pdf__party-name">{client.name}</div>
          {client.phone && <div className="pdf__party-line">{client.phone}</div>}
          {client.email && <div className="pdf__party-line">{client.email}</div>}
        </div>
        <div>
          <div className="pdf__party-label">Property</div>
          <div className="pdf__party-name" style={{ fontWeight: 600, fontSize: 13 }}>{client.property_address}</div>
        </div>
      </div>

      {/* Job */}
      <div className="pdf__job">
        <div className="pdf__job-grid">
          <div className="pdf__job-item"><div className="l">Job</div><div className="v">{quote.roof_type || "Roofing works"}</div></div>
        </div>
        {quote.notes && <div className="pdf__job-note">{quote.notes}</div>}
      </div>

      {/* Body */}
      {quote.show_breakdown ? (
        <>
          {materials.length > 0 && <ItemTable caption="Materials" rows={materials} />}
          {labour.length > 0 && <ItemTable caption="Labour" rows={labour} />}
        </>
      ) : (
        <div className="pdf__single">
          <div className="d">Supply and install — {quote.roof_type || "roofing works"} as described above</div>
          <div className="num" style={{ font: "700 15px/1 var(--font-mono)" }}>{money(dispSubtotal)}</div>
        </div>
      )}

      {/* Totals */}
      <div className="pdf__totals">
        <div className="pdf__totals-inner">
          {quote.gst_enabled ? (
            <>
              <div className="pdf__total-row"><span>Subtotal (ex GST)</span><span className="v">{money(dispSubtotal)}</span></div>
              <div className="pdf__total-row"><span>GST 10%</span><span className="v">{money(dispGst)}</span></div>
              <div className="pdf__total-grand"><span className="l">Total inc GST</span><span className="v">{money(dispTotal)}</span></div>
            </>
          ) : (
            <div className="pdf__total-grand"><span className="l">Total</span><span className="v">{money(dispTotal)}</span></div>
          )}
          {depositPct > 0 && <div className="pdf__total-row" style={{ marginTop: 8 }}><span>Deposit due on acceptance ({depositPct}%)</span><span className="v">{money(depositDue)}</span></div>}
          {!quote.gst_enabled && <div style={{ textAlign: "right", font: "400 10px/1.4 var(--font-sans)", color: "#9aa0ac", marginTop: 6 }}>No GST — supplier is not registered for GST.</div>}
        </div>
      </div>

      {/* Clauses */}
      <div className="pdf__clauses">
        <div>
          <div className="pdf__clause-h">Inclusions</div>
          {(quote.inclusions || []).map((c, i) => (
            <div className="pdf__clause-li inc" key={i}><Icon name="check" size={12} strokeWidth={2.6} color="var(--brand)" /><span>{c}</span></div>
          ))}
        </div>
        <div>
          <div className="pdf__clause-h">Exclusions</div>
          {(quote.exclusions || []).map((c, i) => (
            <div className="pdf__clause-li" key={i}><Icon name="minus" size={12} strokeWidth={2.6} color="#9aa0ac" /><span>{c}</span></div>
          ))}
        </div>
      </div>

      {/* Site photos */}
      {quote.include_photos && (quote.photos || []).length > 0 && (
        <div className="pdf__photos">
          <div className="pdf__clause-h">Site photos</div>
          <div className="pdf__photo-row">
            {quote.photos.map((p) => (
            <div className="pdf__photo-cell" key={p.id}>
              <div className="pdf__photo" style={p.src ? { backgroundImage: `url(${p.src})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(140deg, hsl(${p.hue} 50% 56%), hsl(${p.hue} 44% 38%))` }} />
              {p.caption && <div className="pdf__photo-cap">{p.caption}</div>}
            </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="pdf__foot">
        <div className="pdf__terms"><b>Payment terms.</b> {b.payment_terms}</div>
        <div className="pdf__accept-stmt">Acceptance — I/we accept quote {quote.quote_number} as described above, including the inclusions, exclusions and payment terms.</div>
        <div className="pdf__accept">
          <div className="pdf__accept-field"><div className="line" /><div className="l">Accepted by (print name)</div></div>
          <div className="pdf__accept-field"><div className="line" /><div className="l">Signature</div></div>
          <div className="pdf__accept-field"><div className="line" /><div className="l">Date</div></div>
        </div>
        <div className="pdf__legal">{b.legal_name} · Licence {b.licence_no} · ABN {b.abn} · {b.email} · {b.site}</div>
      </div>
    </div>
  );
}

window.QuotePDF = QuotePDF;
