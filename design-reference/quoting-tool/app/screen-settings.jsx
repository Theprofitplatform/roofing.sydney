/* global React, PageHeader, Button, Icon, IconButton, Field, Input, Textarea, Select, MoneyInput, Card, Toggle, Checkbox, RoofMark, money, useState, useRef, useToast */

function SettingsScreen({ settings, snippets, priceBook, onSaveSettings, onSaveSnippets, onSavePriceBook }) {
  const [tab, setTab] = useState("business");
  const [s, setS] = useState({ ...settings });
  const [snips, setSnips] = useState(snippets.map((x) => ({ ...x })));
  const [pb, setPb] = useState((priceBook || []).map((x) => ({ ...x })));
  const [pbForm, setPbForm] = useState(null); // null | new item draft
  const [editing, setEditing] = useState(null); // snippet id
  const [adding, setAdding] = useState(null); // 'inclusion' | 'exclusion'
  const [draftText, setDraftText] = useState("");
  const logoRef = useRef(null);
  const toast = useToast();

  const onLogoFile = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      if (file.type === "image/svg+xml") { set({ logo_data: fr.result }); return; }
      const img = new Image();
      img.onload = () => {
        const max = 256;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        set({ logo_data: c.toDataURL("image/png") });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  };

  const set = (patch) => setS((p) => ({ ...p, ...patch }));

  const saveBusiness = () => { onSaveSettings(s); toast("Business details saved", "success", "check-circle"); };
  const saveDefaults = () => { onSaveSettings(s); toast("Defaults saved", "success", "check-circle"); };

  const commitPb = (next) => { setPb(next); onSavePriceBook(next); };
  const removePb = (id) => {
    const idx = pb.findIndex((x) => x.id === id);
    const item = pb[idx];
    commitPb(pb.filter((x) => x.id !== id));
    toast("Item removed", "info", "trash-2", {
      label: "Undo",
      onClick: () => setPb((cur) => { const arr = [...cur]; arr.splice(Math.min(idx, arr.length), 0, item); onSavePriceBook(arr); return arr; }),
    });
  };
  const addPb = () => {
    if (!pbForm || !pbForm.description.trim()) return;
    commitPb([...pb, { ...pbForm, id: "p_" + Date.now() }]);
    setPbForm(null); toast("Price book item added", "success", "check-circle");
  };

  const updateSnip = (id, patch) => setSnips((arr) => arr.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const commitSnips = (next) => { setSnips(next); onSaveSnippets(next); };
  const removeSnip = (id) => {
    const idx = snips.findIndex((x) => x.id === id);
    const item = snips[idx];
    const next = snips.filter((x) => x.id !== id);
    commitSnips(next);
    toast("Clause deleted", "info", "trash-2", {
      label: "Undo",
      onClick: () => setSnips((cur) => { const arr = [...cur]; arr.splice(Math.min(idx, arr.length), 0, item); onSaveSnippets(arr); return arr; }),
    });
  };
  const saveEdit = (id) => { commitSnips(snips); setEditing(null); toast("Clause updated", "success", "check-circle"); };
  const toggleDefault = (id) => { const next = snips.map((x) => x.id === id ? { ...x, is_default: !x.is_default } : x); commitSnips(next); };
  const addSnip = (kind) => {
    if (!draftText.trim()) return;
    const next = [...snips, { id: `s_${Date.now()}`, kind, text: draftText.trim(), is_default: false }];
    commitSnips(next); setAdding(null); setDraftText(""); toast("Clause added", "success", "check-circle");
  };

  const SnippetList = ({ kind }) => {
    const list = snips.filter((x) => x.kind === kind);
    return (
      <Card padding>
        <div className="card-head">
          <div>
            <div className="card-title">{kind === "inclusion" ? "Inclusions" : "Exclusions"}</div>
            <div className="card-sub">Default-ticked clauses pre-fill every new quote.</div>
          </div>
          <Button variant="subtle" size="sm" icon="plus" onClick={() => { setAdding(kind); setDraftText(""); }}>Add</Button>
        </div>
        {adding === kind && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Input autoFocus placeholder={`New ${kind} clause…`} value={draftText} onChange={(e) => setDraftText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSnip(kind)} />
            <Button variant="brand" size="sm" onClick={() => addSnip(kind)}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        )}
        <div>
          {list.map((sn) => (
            <div className="snippet-row" key={sn.id}>
              <span style={{ marginTop: 1 }}>
                <button className="check__box-toggle" title={sn.is_default ? "Default on" : "Default off"} onClick={() => toggleDefault(sn.id)}
                  style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${sn.is_default ? "var(--brand)" : "var(--input)"}`, background: sn.is_default ? "var(--brand)" : "transparent", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  {sn.is_default && <Icon name="check" size={12} strokeWidth={3} />}
                </button>
              </span>
              {editing === sn.id ? (
                <Input value={sn.text} onChange={(e) => updateSnip(sn.id, { text: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveEdit(sn.id)} autoFocus />
              ) : (
                <span className="snippet-row__text">{sn.text}</span>
              )}
              <div className="snippet-row__actions">
                {editing === sn.id ? (
                  <IconButton icon="check" size={15} onClick={() => saveEdit(sn.id)} />
                ) : (
                  <IconButton icon="pen-line" size={14} onClick={() => setEditing(sn.id)} />
                )}
                <IconButton icon="trash-2" size={14} onClick={() => removeSnip(sn.id)} />
              </div>
            </div>
          ))}
          {list.length === 0 && <div style={{ padding: "10px 0", font: "400 13px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>No {kind} clauses yet.</div>}
        </div>
      </Card>
    );
  };

  return (
    <div className="stack-6">
      <PageHeader title="Settings" description="Business details and the clause library that feeds your quotes." />
      <div className="settings-grid">
        <nav className="settings-tabs">
          <button className={`settings-tab ${tab === "business" ? "is-active" : ""}`} onClick={() => setTab("business")}><Icon name="building-2" size={16} />Business</button>
          <button className={`settings-tab ${tab === "defaults" ? "is-active" : ""}`} onClick={() => setTab("defaults")}><Icon name="sliders-horizontal" size={16} />Defaults</button>
          <button className={`settings-tab ${tab === "pricebook" ? "is-active" : ""}`} onClick={() => setTab("pricebook")}><Icon name="book-open" size={16} />Price book</button>
          <button className={`settings-tab ${tab === "clauses" ? "is-active" : ""}`} onClick={() => setTab("clauses")}><Icon name="list-checks" size={16} />Clause library</button>
        </nav>

        {tab === "business" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card padding>
              <div className="card-head"><div><div className="card-title">Identity</div><div className="card-sub">Appears on every quote header and PDF footer.</div></div></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="logo-drop">
                  <span className="logo-drop__preview">{s.logo_data ? <img src={s.logo_data} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <RoofMark size={30} />}</span>
                  <div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="outline" size="sm" icon="upload" onClick={() => logoRef.current && logoRef.current.click()}>Upload logo</Button>
                      {s.logo_data && <Button variant="ghost" size="sm" icon="x" onClick={() => set({ logo_data: "" })}>Remove</Button>}
                    </div>
                    <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" style={{ display: "none" }} onChange={(e) => { onLogoFile(e.target.files[0]); e.target.value = ""; }} />
                    <div style={{ font: "400 11.5px/1.4 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 8 }}>PNG or SVG, square. Falls back to the roof mark. Save to apply.</div>
                  </div>
                </div>
                <div className="grid-2">
                  <Field label="Business name"><Input value={s.business_name} onChange={(e) => set({ business_name: e.target.value })} /></Field>
                  <Field label="Owner / signatory" hint="Signs quote emails"><Input value={s.owner_name || ""} onChange={(e) => set({ owner_name: e.target.value })} /></Field>
                </div>
                <div className="grid-3">
                  <Field label="Licence no."><Input className="mono" value={s.licence_no} onChange={(e) => set({ licence_no: e.target.value })} /></Field>
                  <Field label="ABN"><Input className="mono" value={s.abn} onChange={(e) => set({ abn: e.target.value })} /></Field>
                  <Field label="ACN"><Input className="mono" value={s.acn} onChange={(e) => set({ acn: e.target.value })} /></Field>
                </div>
                <div className="grid-2">
                  <Field label="Phone"><Input value={s.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
                  <Field label="Email"><Input value={s.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                </div>
              </div>
            </Card>

            <Card padding>
              <div className="card-head"><div><div className="card-title">Tax &amp; terms</div><div className="card-sub">Changing these affects future PDFs only.</div></div></div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--fill-1)", border: "1px solid var(--border)", borderRadius: 9, marginBottom: 14 }}>
                <div>
                  <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>GST registered</div>
                  <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>Leave off — the business is not currently registered for GST.</div>
                </div>
                <Toggle on={s.gst_registered} onChange={(v) => set({ gst_registered: v })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: "var(--fill-1)", border: "1px solid var(--border)", borderRadius: 9, marginBottom: 14 }}>
                <div>
                  <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>Deposit on acceptance</div>
                  <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>Prints a “deposit due on acceptance” line on every quote PDF.</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {s.deposit_enabled && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <Input className="mono" inputMode="decimal" style={{ width: 64, textAlign: "right" }} value={s.deposit_pct} onChange={(e) => set({ deposit_pct: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                      <span style={{ font: "500 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>%</span>
                    </span>
                  )}
                  <Toggle on={!!s.deposit_enabled} onChange={(v) => set({ deposit_enabled: v })} />
                </div>
              </div>
              <Field label="Payment terms" hint="Shown on every quote PDF. Edit to match your contract.">
                <Textarea style={{ minHeight: 160, lineHeight: 1.55 }} value={s.payment_terms} onChange={(e) => set({ payment_terms: e.target.value })} />
              </Field>
            </Card>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <Button variant="brand" icon="save" onClick={saveBusiness}>Save business details</Button>
              <Button variant="ghost" icon="rotate-ccw" onClick={() => {
                if (confirm("Reset all clients, quotes, price book and settings back to the sample data? This clears any changes saved in this browser.")) {
                  try { localStorage.removeItem("arc_state_v3"); localStorage.removeItem("arc_state_v2"); localStorage.removeItem("arc_state_v1"); } catch (e) {}
                  location.reload();
                }
              }}>Reset demo data</Button>
            </div>
          </div>
        )}

        {tab === "defaults" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card padding>
              <div className="card-head"><div><div className="card-title">Quote defaults</div><div className="card-sub">New quotes start with these values. Existing quotes are unaffected.</div></div></div>
              <div className="grid-2">
                <Field label="Default margin %" hint="Pre-filled on every new quote">
                  <Input className="mono" inputMode="decimal" value={s.default_margin_pct} onChange={(e) => set({ default_margin_pct: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                </Field>
                <Field label="Default valid-for days">
                  <Input className="mono" inputMode="numeric" value={s.default_valid_days} onChange={(e) => set({ default_valid_days: parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                </Field>
                <Field label="Margin floor %" hint="Warn when a quote dips below this">
                  <Input className="mono" inputMode="decimal" value={s.margin_floor_pct} onChange={(e) => set({ margin_floor_pct: parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} />
                </Field>
                <Field label="Follow-up after (days)" hint="Flag sent quotes with no decision">
                  <Input className="mono" inputMode="numeric" value={s.follow_up_days} onChange={(e) => set({ follow_up_days: parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                </Field>
              </div>
            </Card>
            <div><Button variant="brand" icon="save" onClick={saveDefaults}>Save defaults</Button></div>
          </div>
        )}

        {tab === "pricebook" && (
          <Card padding>
            <div className="card-head">
              <div><div className="card-title">Price book</div><div className="card-sub">Reusable materials &amp; labour you can tap into any quote.</div></div>
              <Button variant="subtle" size="sm" icon="plus" onClick={() => setPbForm({ kind: "material", category: "Sheet roofing", description: "", unit: "m2", unit_cost_cents: 0 })}>Add item</Button>
            </div>
            {pbForm && (
              <div className="pb-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 110px 80px 120px auto", gap: 8, alignItems: "end", padding: 12, marginBottom: 12, background: "var(--fill-1)", border: "1px dashed var(--border)", borderRadius: 10 }}>
                <Field label="Description"><Input autoFocus value={pbForm.description} onChange={(e) => setPbForm({ ...pbForm, description: e.target.value })} placeholder="e.g. Ridge capping" /></Field>
                <Field label="Kind"><Select value={pbForm.kind} onChange={(e) => setPbForm({ ...pbForm, kind: e.target.value })}><option value="material">Material</option><option value="labour">Labour</option></Select></Field>
                <Field label="Unit"><Select value={pbForm.unit} onChange={(e) => setPbForm({ ...pbForm, unit: e.target.value })}>{["ea","m","m2","hr","day","L","item"].map((u) => <option key={u} value={u}>{u}</option>)}</Select></Field>
                <Field label="Unit cost"><MoneyInput valueCents={pbForm.unit_cost_cents} onChangeCents={(c) => setPbForm({ ...pbForm, unit_cost_cents: c })} /></Field>
                <div style={{ display: "flex", gap: 6 }}><Button variant="brand" size="sm" onClick={addPb}>Add</Button><Button variant="ghost" size="sm" onClick={() => setPbForm(null)}>Cancel</Button></div>
              </div>
            )}
            <div>
              {pb.map((item) => (
                <div className="snippet-row" key={item.id} style={{ alignItems: "center" }}>
                  <span className={`pb-item__kind pb-item__kind--${item.kind}`}>{item.kind === "material" ? "MAT" : "LAB"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: "500 13px/1.3 var(--font-sans)" }}>{item.description}</div>
                    <div style={{ font: "400 11px/1.2 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 2 }}>{item.category}</div>
                  </div>
                  <span className="mono" style={{ font: "500 12.5px/1 var(--font-mono)" }}>{money(item.unit_cost_cents)}<span style={{ color: "var(--muted-foreground)" }}>/{item.unit}</span></span>
                  <IconButton icon="trash-2" size={14} onClick={() => removePb(item.id)} />
                </div>
              ))}
              {pb.length === 0 && <div style={{ padding: "10px 0", font: "400 13px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>No price book items yet.</div>}
            </div>
          </Card>
        )}

        {tab === "clauses" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <SnippetList kind="inclusion" />
            <SnippetList kind="exclusion" />
          </div>
        )}
      </div>
    </div>
  );
}

window.SettingsScreen = SettingsScreen;
