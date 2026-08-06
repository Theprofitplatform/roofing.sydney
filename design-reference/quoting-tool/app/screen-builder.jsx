/* global React, PageHeader, Button, Icon, IconButton, Field, Input, Textarea, Select, MoneyInput, Toggle, Checkbox, Card, Modal, ClientModal, money, moneyShort, lineTotalCents, computeTotals, useState, useEffect, useRef, useMemo, useToast */

const UNITS = ["ea", "m", "m2", "hr", "day", "L", "item"];
let _liSeq = 1;
const liId = () => `li_${_liSeq++}`;

function withIds(items) { return (items || []).map((it) => ({ ...it, _id: liId() })); }
function blankRow(kind) { return { _id: liId(), kind, description: "", qty: 1, unit: kind === "labour" ? "hr" : "ea", unit_cost_cents: 0 }; }

/* Price book recents (localStorage) */
function getPbRecents() { try { return JSON.parse(localStorage.getItem("arc_pb_recents") || "[]"); } catch (e) { return []; } }
function pushPbRecent(id) { try { const r = [id, ...getPbRecents().filter((x) => x !== id)].slice(0, 6); localStorage.setItem("arc_pb_recents", JSON.stringify(r)); } catch (e) {} }

/* ---------- Line item group (drag on desktop, chevrons on touch) ---------- */
function LineItemGroup({ kind, items, onChange }) {
  const isMat = kind === "material";
  const groupItems = items.filter((i) => i.kind === kind);
  const sum = groupItems.reduce((s, i) => s + lineTotalCents(i), 0);
  const [dragId, setDragId] = useState(null);
  const toast = useToast();

  const update = (id, patch) => onChange(items.map((i) => (i._id === id ? { ...i, ...patch } : i)));
  const add = () => onChange([...items, blankRow(kind)]);

  const remove = (id) => {
    const idx = items.findIndex((i) => i._id === id);
    const it = items[idx];
    onChange(items.filter((i) => i._id !== id));
    if (it && it.description.trim()) {
      const label = it.description.length > 34 ? it.description.slice(0, 34) + "…" : it.description;
      toast(`Removed "${label}"`, "info", "trash-2", {
        label: "Undo",
        onClick: () => onChange((cur) => { const arr = [...cur]; arr.splice(Math.min(idx, arr.length), 0, it); return arr; }),
      });
    }
  };

  const reorder = (fromId, toId) => {
    if (fromId === toId) return;
    const arr = [...items];
    const from = arr.findIndex((i) => i._id === fromId);
    const to = arr.findIndex((i) => i._id === toId);
    if (from < 0 || to < 0 || arr[from].kind !== arr[to].kind) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    onChange(arr);
  };

  const move = (id, dir) => {
    const gi = groupItems.findIndex((i) => i._id === id);
    const target = groupItems[gi + dir];
    if (!target) return;
    reorder(id, target._id);
  };

  return (
    <div className="li-group">
      <div className="li-group__head">
        <span className="dot" style={{ background: isMat ? "var(--brand)" : "var(--status-warning)" }} />
        <span className="li-group__title">{isMat ? "Materials" : "Labour"}</span>
        <span className="li-group__sum">{money(sum)}</span>
      </div>

      <div className="li-table">
        <div className="li-head">
          <span />
          <span>Description</span>
          <span className="t-right">Qty</span>
          <span>Unit</span>
          <span className="t-right">Unit cost</span>
          <span className="t-right">Total</span>
          <span />
        </div>
        {groupItems.length === 0 && (
          <div style={{ padding: "10px 2px", font: "400 12.5px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>
            No {isMat ? "materials" : "labour"} added yet.
          </div>
        )}
        {groupItems.map((it, gi) => (
          <div
            className={`li-row ${dragId === it._id ? "is-dragging" : ""}`} key={it._id}
            draggable
            onDragStart={() => setDragId(it._id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { reorder(dragId, it._id); setDragId(null); }}
          >
            <span className="li-row__grip" title="Drag to reorder"><Icon name="grip-vertical" size={14} /></span>
            <div className="li-desc">
              <Input placeholder={isMat ? "e.g. Colorbond Trimdek — Surfmist" : "e.g. Sheet installation (2 crew)"} value={it.description} onChange={(e) => update(it._id, { description: e.target.value })} />
            </div>
            <Input className="t-right mono" inputMode="decimal" aria-label="Quantity" value={it.qty} onChange={(e) => update(it._id, { qty: e.target.value.replace(/[^0-9.]/g, "") })} />
            <Select value={it.unit} aria-label="Unit" onChange={(e) => update(it._id, { unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
            <MoneyInput valueCents={it.unit_cost_cents} aria-label="Unit cost" onChangeCents={(c) => update(it._id, { unit_cost_cents: c })} />
            <span className="li-row__total">{money(lineTotalCents(it))}</span>
            <span className="li-row__move">
              <button className="li-move-btn" aria-label="Move up" disabled={gi === 0} onClick={() => move(it._id, -1)}><Icon name="chevron-up" size={15} /></button>
              <button className="li-move-btn" aria-label="Move down" disabled={gi === groupItems.length - 1} onClick={() => move(it._id, 1)}><Icon name="chevron-down" size={15} /></button>
            </span>
            <button className="li-row__del" title="Remove line" aria-label="Remove line" onClick={() => remove(it._id)}><Icon name="trash-2" size={15} /></button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" icon="plus" className="li-add" onClick={add}>Add {isMat ? "material" : "labour"}</Button>
    </div>
  );
}

/* ---------- Price book picker (bottom sheet on mobile) ---------- */
function PriceBookPicker({ priceBook, lineItems, onAdd, onUpdateQty, onClose }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [added, setAdded] = useState({}); // pbId -> line item _id
  const term = q.trim().toLowerCase();
  const cats = [...new Set(priceBook.map((p) => p.category))];
  const recentIds = useMemo(getPbRecents, []);
  const recents = recentIds.map((id) => priceBook.find((p) => p.id === id)).filter(Boolean);

  const list = priceBook.filter((p) =>
    (cat === "all" || p.category === cat) &&
    (!term || p.description.toLowerCase().includes(term) || p.category.toLowerCase().includes(term))
  );
  const listCats = [...new Set(list.map((p) => p.category))];

  const addOne = (p) => {
    const id = onAdd(p);
    setAdded((a) => ({ ...a, [p.id]: id }));
    pushPbRecent(p.id);
  };
  const qtyOf = (pbId) => {
    const li = lineItems.find((i) => i._id === added[pbId]);
    return li ? (parseFloat(li.qty) || 0) : 0;
  };
  const step = (p, delta) => {
    const next = Math.max(1, qtyOf(p.id) + delta);
    onUpdateQty(added[p.id], next);
  };
  const addedCount = Object.keys(added).length;

  const Row = ({ p }) => (
    added[p.id] ? (
      <div className="pb-item pb-item--added">
        <span className={`pb-item__kind pb-item__kind--${p.kind}`}>{p.kind === "material" ? "MAT" : "LAB"}</span>
        <span className="pb-item__desc">{p.description}</span>
        <span className="pb-stepper">
          <button className="pb-stepper__btn" aria-label="Decrease quantity" onClick={() => step(p, -1)}><Icon name="minus" size={14} /></button>
          <span className="pb-stepper__val mono">{qtyOf(p.id)}<span>{p.unit}</span></span>
          <button className="pb-stepper__btn" aria-label="Increase quantity" onClick={() => step(p, 1)}><Icon name="plus" size={14} /></button>
        </span>
      </div>
    ) : (
      <button className="pb-item" onClick={() => addOne(p)}>
        <span className={`pb-item__kind pb-item__kind--${p.kind}`}>{p.kind === "material" ? "MAT" : "LAB"}</span>
        <span className="pb-item__desc">{p.description}</span>
        <span className="pb-item__price mono">{money(p.unit_cost_cents)}<span style={{ color: "var(--muted-foreground)" }}>/{p.unit}</span></span>
        <span className="pb-item__add"><Icon name="plus" size={15} /></span>
      </button>
    )
  );

  return (
    <Modal sheet title="Add from price book" sub="Tap to add, then set quantities right here." onClose={onClose} maxWidth={560}
      footer={<Button variant="brand" icon="check" onClick={onClose}>{addedCount ? `Done · ${addedCount} added` : "Done"}</Button>}>
      <div className="search" style={{ maxWidth: "none", marginBottom: 10 }}>
        <Icon name="search" size={15} /><input placeholder="Search materials & labour…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search price book" />
      </div>
      <div className="chip-row">
        <button className={`chip ${cat === "all" ? "is-active" : ""}`} onClick={() => setCat("all")}>All</button>
        {cats.map((c) => (
          <button key={c} className={`chip ${cat === c ? "is-active" : ""}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div style={{ maxHeight: "46vh", overflow: "auto", margin: "0 -4px", padding: "0 4px" }}>
        {cat === "all" && !term && recents.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>Recent</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recents.map((p) => <Row p={p} key={`r-${p.id}`} />)}
            </div>
          </div>
        )}
        {listCats.map((c) => (
          <div key={c} style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>{c}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {list.filter((p) => p.category === c).map((p) => <Row p={p} key={p.id} />)}
            </div>
          </div>
        ))}
        {list.length === 0 && <div style={{ padding: "14px 2px", font: "400 13px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>Nothing matches — try another term or category.</div>}
      </div>
    </Modal>
  );
}

/* ---------- Area calculator → pushes a bundle of lines ---------- */
function AreaCalc({ priceBook, onAddLines }) {
  const [open, setOpen] = useState(false);
  const [l, setL] = useState(""); const [w, setW] = useState("");
  const [sel, setSel] = useState({ sheets: true, insulation: true, battens: true });
  const area = (parseFloat(l) || 0) * (parseFloat(w) || 0);
  const rounded = Math.round(area * 10) / 10;

  const findPb = (re) => priceBook.find((p) => re.test(p.description));
  const pbSheets = findPb(/sheet|trimdek|klip/i);
  const pbInsul = findPb(/insulation|anticon/i);
  const pbBatt = findPb(/batten/i);
  const battLen = Math.round(rounded * 1.3);

  const options = [
    { key: "sheets", label: pbSheets ? pbSheets.description : "Roofing sheets", qty: rounded, unit: "m2", cost: pbSheets ? pbSheets.unit_cost_cents : 0 },
    { key: "insulation", label: pbInsul ? pbInsul.description : "Insulation blanket", qty: rounded, unit: "m2", cost: pbInsul ? pbInsul.unit_cost_cents : 0 },
    { key: "battens", label: pbBatt ? pbBatt.description : "Battens", qty: battLen, unit: "m", cost: pbBatt ? pbBatt.unit_cost_cents : 0, note: "×1.3 coverage" },
  ];
  const picked = options.filter((o) => sel[o.key]);

  const addLines = () => {
    const lines = picked.length > 0
      ? picked.map((o) => ({ _id: liId(), kind: "material", description: o.label, qty: o.qty, unit: o.unit, unit_cost_cents: o.cost }))
      : [{ _id: liId(), kind: "material", description: "Roof area", qty: rounded, unit: "m2", unit_cost_cents: 0 }];
    onAddLines(lines);
    setL(""); setW("");
  };

  return (
    <div className="area-calc">
      <button className="area-calc__toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="ruler" size={14} /> Area calculator <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
      </button>
      {open && (
        <div className="area-calc__body">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Field label="Length (m)" style={{ width: 96 }}><Input className="mono" inputMode="decimal" value={l} onChange={(e) => setL(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
            <span style={{ paddingBottom: 10, color: "var(--muted-foreground)" }}>×</span>
            <Field label="Width (m)" style={{ width: 96 }}><Input className="mono" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value.replace(/[^0-9.]/g, ""))} /></Field>
            <div style={{ paddingBottom: 6 }}>
              <div className="field__label">Area</div>
              <div className="mono" style={{ font: "700 18px/1 var(--font-mono)", marginTop: 8 }}>{rounded} m²</div>
            </div>
          </div>
          <div className="area-bundle">
            {options.map((o) => (
              <div className="area-bundle__row" key={o.key}>
                <Checkbox on={!!sel[o.key]} onChange={(v) => setSel((s) => ({ ...s, [o.key]: v }))}>{o.label}</Checkbox>
                <span className="area-bundle__qty mono">{rounded > 0 ? `${o.qty} ${o.unit === "m2" ? "m²" : o.unit}` : "—"}{o.note && <span className="area-bundle__note"> · {o.note}</span>}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <Button variant="subtle" size="sm" icon="plus" disabled={rounded <= 0} onClick={addLines}>
              {picked.length > 1 ? `Add ${picked.length} lines at ${rounded} m²` : picked.length === 1 ? `Add line at ${rounded} m²` : "Add as blank line"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Site photos (with PDF captions) ---------- */
function PhotosSection({ photos, onChange, include, onToggleInclude }) {
  const fileRef = useRef(null);
  const readPhoto = (file) => new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1200;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.78));
      };
      img.onerror = () => resolve(null);
      img.src = fr.result;
    };
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  });
  const addFiles = async (list) => {
    const srcs = (await Promise.all(Array.from(list || []).map(readPhoto))).filter(Boolean);
    if (srcs.length) onChange([...(photos || []), ...srcs.map((src, i) => ({ id: "ph_" + Date.now() + "_" + i, src, caption: "" }))]);
  };
  const remove = (id) => onChange((photos || []).filter((p) => p.id !== id));
  const setCaption = (id, caption) => onChange((photos || []).map((p) => (p.id === id ? { ...p, caption } : p)));
  return (
    <div>
      <div className="photo-grid">
        {(photos || []).map((p) => (
          <div className="photo-cell" key={p.id}>
            <div className="photo-tile" style={p.src ? { backgroundImage: `url(${p.src})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(140deg, hsl(${p.hue} 50% 56%), hsl(${p.hue} 44% 38%))` }}>
              {!p.src && <Icon name="image" size={20} color="oklch(1 0 0 / 0.7)" />}
              <button className="photo-tile__del" title="Remove photo" aria-label="Remove photo" onClick={() => remove(p.id)}><Icon name="x" size={12} /></button>
            </div>
            {include && <input className="photo-cap" placeholder="Caption on PDF…" value={p.caption || ""} onChange={(e) => setCaption(p.id, e.target.value)} aria-label="Photo caption" />}
          </div>
        ))}
        <button className="photo-add" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="camera" size={18} /><span>Add photo</span></button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <Checkbox on={!!include} onChange={onToggleInclude}>Include site photos on the PDF</Checkbox>
      </div>
    </div>
  );
}

/* ---------- Clause checklist ---------- */
function ClauseSection({ kind, snippets, checked, onToggle, customs, onAddCustom, onRemoveCustom }) {
  const [draft, setDraft] = useState("");
  const list = snippets.filter((s) => s.kind === kind);
  const heading = kind === "inclusion" ? "Inclusions" : "Exclusions";
  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>{heading}</div>
      <div className="clause-list">
        {list.map((s) => (
          <div className="clause-item" key={s.id}>
            <Checkbox on={checked.has(s.text)} onChange={() => onToggle(s.text)}>{s.text}</Checkbox>
          </div>
        ))}
        {customs.map((c, i) => (
          <div className="clause-item" key={`custom-${i}`} style={{ alignItems: "center" }}>
            <Checkbox on={true} onChange={() => onRemoveCustom(i)}>{c}</Checkbox>
            <IconButton icon="x" size={13} title="Remove custom clause" style={{ marginLeft: "auto" }} onClick={() => onRemoveCustom(i)} />
          </div>
        ))}
      </div>
      <div className="clause-add-row">
        <Input placeholder={`Add a custom ${kind}…`} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { onAddCustom(draft.trim()); setDraft(""); } }} />
        <Button variant="subtle" size="sm" icon="plus" onClick={() => { if (draft.trim()) { onAddCustom(draft.trim()); setDraft(""); } }}>Add</Button>
      </div>
    </div>
  );
}

/* ---------- Collapsible section (accordion on mobile) ---------- */
function Section({ id, num, title, small, right, complete, optional, open, onToggle, children }) {
  return (
    <div className={`fieldset ${open ? "" : "is-closed"}`}>
      <div className="fieldset__head fieldset__head--btn" role="button" tabIndex={0} aria-expanded={open}
        onClick={() => onToggle(id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(id); } }}>
        <span className={`fieldset__num ${complete ? "is-done" : ""}`}>{complete ? <Icon name="check" size={12} strokeWidth={3} /> : num}</span>
        <div className="fieldset__title">{title}{small && <small>{small}</small>}</div>
        {right && <div onClick={(e) => e.stopPropagation()} style={{ marginLeft: "auto" }}>{right}</div>}
        {optional && !complete && <span className="fieldset__opt">optional</span>}
        <span className="fieldset__chev"><Icon name="chevron-down" size={16} /></span>
      </div>
      <div className="fieldset__body">{children}</div>
    </div>
  );
}

/* ---------- The builder ---------- */
function BuilderScreen({ initialQuote, isNew, clients, snippets, priceBook, settings, onAddClient, onUpdateClient, onSave, onCancel, onPreview, onEmail, onDirtyChange }) {
  const [draft, setDraft] = useState(() => ({ ...initialQuote, line_items: withIds(initialQuote.line_items) }));
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(!isNew);
  const [clientModal, setClientModal] = useState(null);
  const [pbOpen, setPbOpen] = useState(false);
  const toast = useToast();

  const set = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); onDirtyChange && onDirtyChange(true); };
  const setItems = (next) => {
    setDraft((d) => ({ ...d, line_items: typeof next === "function" ? next(d.line_items) : next }));
    setDirty(true); onDirtyChange && onDirtyChange(true);
  };

  const totals = useMemo(() => computeTotals(draft), [draft]);
  const client = clients.find((c) => c.id === draft.client_id);
  const marginPct = parseFloat(draft.margin_pct) || 0;
  const lowMargin = marginPct < (settings.margin_floor_pct || 0);

  const checkedInc = useMemo(() => new Set(draft.inclusions || []), [draft.inclusions]);
  const checkedExc = useMemo(() => new Set(draft.exclusions || []), [draft.exclusions]);

  const toggleClause = (kind, text) => {
    const key = kind === "inclusion" ? "inclusions" : "exclusions";
    const cur = new Set(draft[key] || []);
    cur.has(text) ? cur.delete(text) : cur.add(text);
    set({ [key]: Array.from(cur) });
  };

  const incCustoms = draft.custom_inclusions || [];
  const excCustoms = draft.custom_exclusions || [];
  const addCustom = (kind, text) => { const key = kind === "inclusion" ? "custom_inclusions" : "custom_exclusions"; set({ [key]: [...(draft[key] || []), text] }); };
  const removeCustom = (kind, idx) => { const key = kind === "inclusion" ? "custom_inclusions" : "custom_exclusions"; set({ [key]: (draft[key] || []).filter((_, i) => i !== idx) }); };

  const appendItems = (arr) => setItems((cur) => [...cur, ...arr]);
  const addFromBook = (p) => {
    const item = { _id: liId(), kind: p.kind, description: p.description, qty: 1, unit: p.unit, unit_cost_cents: p.unit_cost_cents };
    appendItems([item]);
    return item._id;
  };
  const updateItemQty = (id, qty) => setItems((cur) => cur.map((i) => (i._id === id ? { ...i, qty } : i)));

  const realItems = (draft.line_items || []).filter((i) => i.description.trim());
  const canSave = !!draft.client_id && realItems.length > 0;

  /* Section completion + accordion state (collapsed on phones) */
  const complete = {
    client: !!draft.client_id,
    job: !!(draft.roof_type || "").trim(),
    items: realItems.length > 0,
    margin: marginPct > 0,
    clauses: (draft.inclusions || []).length + incCustoms.length + (draft.exclusions || []).length + excCustoms.length > 0,
    photos: (draft.photos || []).length > 0,
  };
  const [openSecs, setOpenSecs] = useState(() => {
    const mobile = window.matchMedia("(max-width: 940px)").matches;
    if (!mobile) return { client: true, job: true, items: true, margin: true, clauses: true, photos: true };
    const first = !initialQuote.client_id ? "client" : !(initialQuote.roof_type || "").trim() ? "job" : "items";
    return { [first]: true };
  });
  const toggleSec = (id) => setOpenSecs((s) => ({ ...s, [id]: !s[id] }));

  const commit = (extra) => ({
    ...draft,
    line_items: realItems.map(({ _id, ...rest }) => rest),
    inclusions: [...(draft.inclusions || []), ...incCustoms],
    exclusions: [...(draft.exclusions || []), ...excCustoms],
    subtotal_cents: totals.subtotal,
    total_cents: totals.total,
    ...extra,
  });

  // Auto-save: silently persist a debounced draft once it's saveable.
  useEffect(() => {
    if (!dirty || !canSave) return;
    const id = setTimeout(() => {
      onSave(commit());
      setDirty(false); setSavedOnce(true); onDirtyChange && onDirtyChange(false);
    }, 1400);
    return () => clearTimeout(id);
  }, [draft, dirty, canSave]);

  const doSave = () => { onSave(commit()); setDirty(false); setSavedOnce(true); onDirtyChange && onDirtyChange(false); toast("Draft saved", "success", "check-circle"); };
  const doPreview = () => { onSave(commit()); setDirty(false); onDirtyChange && onDirtyChange(false); onPreview(draft.id); };
  const doEmail = () => { onSave(commit()); setDirty(false); onDirtyChange && onDirtyChange(false); onEmail(draft.id); };

  const handleClientSave = (data) => {
    if (clientModal && clientModal.id) { onUpdateClient(clientModal.id, data); toast("Client updated", "success", "check-circle"); }
    else { const c = onAddClient(data); set({ client_id: c.id }); }
    setClientModal(null);
  };

  const saveLabel = !savedOnce && !dirty ? "Not saved yet" : dirty ? (canSave ? "Saving…" : "Unsaved changes") : "All changes saved";
  const saveCls = dirty ? (canSave ? "is-saving" : "is-dirty") : savedOnce ? "is-saved" : "";

  const internalBadge = (
    <span className="int-badge" title="Internal only — the client PDF shows sell prices; your margin is never printed.">
      <Icon name="eye-off" size={10} strokeWidth={2.4} />internal
    </span>
  );

  return (
    <div className="stack-6 builder-page">
      <PageHeader
        crumbs={[{ label: "Quotes", onClick: onCancel }, { label: isNew ? "New quote" : draft.quote_number }]}
        title={isNew ? "New quote" : `Edit ${draft.quote_number}`}
        description={isNew ? "Build a quote from your site visit — totals update as you type, and drafts autosave." : "Editing a saved quote. Changes recompute totals live."}
      />

      <div className="builder">
        <div className="builder__form">
          <Section id="client" num="1" title="Client & property" complete={complete.client} open={!!openSecs.client} onToggle={toggleSec}>
            <div className="grid-2">
              <Field label="Client" required>
                <Select value={draft.client_id || ""} onChange={(e) => { if (e.target.value === "__new") { setClientModal({}); } else { set({ client_id: e.target.value }); } }}>
                  <option value="">Select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  <option value="__new">+ Add new client…</option>
                </Select>
              </Field>
              <Field label="Property address">
                <Input value={client?.property_address || ""} readOnly placeholder="Set on the client record" style={{ color: "var(--muted-foreground)" }} />
              </Field>
            </div>
            {client && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, font: "400 12px/1.4 var(--font-sans)", color: "var(--muted-foreground)", flexWrap: "wrap" }}>
                {client.phone && <span><Icon name="phone" size={12} style={{ marginRight: 5, verticalAlign: "-2px" }} />{client.phone}</span>}
                <span style={{ color: client.email ? "var(--muted-foreground)" : "var(--status-warning)" }}>
                  <Icon name="mail" size={12} style={{ marginRight: 5, verticalAlign: "-2px" }} />{client.email || "No email on file — needed to send"}
                </span>
                <Button variant="ghost" size="sm" icon="pen-line" style={{ marginLeft: "auto" }} onClick={() => setClientModal(client)}>Edit client</Button>
              </div>
            )}
          </Section>

          <Section id="job" num="2" title="Job details" complete={complete.job} open={!!openSecs.job} onToggle={toggleSec}>
            <div className="grid-2" style={{ marginBottom: 12 }}>
              <Field label="Roof type / job"><Input value={draft.roof_type || ""} onChange={(e) => set({ roof_type: e.target.value })} placeholder="e.g. Colorbond Trimdek — full re-roof" /></Field>
              <Field label="Quote valid for" hint="Days the price holds">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Input className="mono" style={{ width: 80 }} inputMode="numeric" value={draft.valid_days} onChange={(e) => set({ valid_days: parseInt(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                  <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>days</span>
                </div>
              </Field>
            </div>
            <Field label="Notes" hint="Shown on the quote above the line items.">
              <Textarea value={draft.notes || ""} onChange={(e) => set({ notes: e.target.value })} placeholder="Scope, access, colour selections, conditions…" />
            </Field>
            <div className="toggle-card">
              <div>
                <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>Show line-item breakdown on PDF</div>
                <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>Off shows a single "supply &amp; install" total instead.</div>
              </div>
              <Toggle on={draft.show_breakdown} onChange={(v) => set({ show_breakdown: v })} />
            </div>
            <div className="toggle-card" style={{ marginTop: 10 }}>
              <div>
                <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>PDF layout</div>
                <div style={{ font: "400 11.5px/1.3 var(--font-sans)", color: "var(--muted-foreground)", marginTop: 3 }}>Two takes on the branded quote.</div>
              </div>
              <div className="seg">
                <button className={`seg__btn ${(draft.pdf_layout || "classic") === "classic" ? "is-active" : ""}`} onClick={() => set({ pdf_layout: "classic" })}>Classic</button>
                <button className={`seg__btn ${draft.pdf_layout === "modern" ? "is-active" : ""}`} onClick={() => set({ pdf_layout: "modern" })}>Modern</button>
              </div>
            </div>
          </Section>

          <Section id="items" num="3" title="Line items" small="Drag to reorder (or use the arrows). Totals update live."
            complete={complete.items} open={!!openSecs.items} onToggle={toggleSec}
            right={<Button variant="outline" size="sm" icon="book-open" onClick={() => setPbOpen(true)}>Price book</Button>}>
            <AreaCalc priceBook={priceBook} onAddLines={appendItems} />
            <LineItemGroup kind="material" items={draft.line_items} onChange={setItems} />
            <LineItemGroup kind="labour" items={draft.line_items} onChange={setItems} />
          </Section>

          <Section id="margin" num="4" title="Margin & tax" complete={complete.margin} open={!!openSecs.margin} onToggle={toggleSec}>
            <div className="grid-2">
              <Field label={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Margin % {internalBadge}</span>} hint={`Adds ${money(totals.margin)} to the subtotal`}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Input className="mono" style={{ width: 90, borderColor: lowMargin ? "var(--status-warning)" : undefined }} inputMode="decimal" value={draft.margin_pct} onChange={(e) => set({ margin_pct: e.target.value.replace(/[^0-9.]/g, "") })} />
                  <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>%</span>
                </div>
              </Field>
              <Field label="GST" hint={draft.gst_enabled ? "Adds 10% to the total." : "Business is not GST-registered."}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, height: 38 }}>
                  <Toggle on={draft.gst_enabled} onChange={(v) => set({ gst_enabled: v })} label={draft.gst_enabled ? "GST on (10%)" : "GST off"} />
                </div>
              </Field>
            </div>
            {lowMargin && (
              <div className="inline-warn"><Icon name="alert-triangle" size={14} />Margin is below your {settings.margin_floor_pct}% floor — check this covers your costs.</div>
            )}
          </Section>

          <Section id="clauses" num="5" title="Inclusions & exclusions" small="Ticked clauses are copied onto this quote. Later edits to the library won't change it."
            complete={complete.clauses} open={!!openSecs.clauses} onToggle={toggleSec}>
            <div className="grid-2" style={{ alignItems: "start", gap: 24 }}>
              <ClauseSection kind="inclusion" snippets={snippets} checked={checkedInc} onToggle={(t) => toggleClause("inclusion", t)} customs={incCustoms} onAddCustom={(t) => addCustom("inclusion", t)} onRemoveCustom={(i) => removeCustom("inclusion", i)} />
              <ClauseSection kind="exclusion" snippets={snippets} checked={checkedExc} onToggle={(t) => toggleClause("exclusion", t)} customs={excCustoms} onAddCustom={(t) => addCustom("exclusion", t)} onRemoveCustom={(i) => removeCustom("exclusion", i)} />
            </div>
          </Section>

          <Section id="photos" num="6" title="Site photos" small="From your visit. Optionally print them on the quote with captions."
            complete={complete.photos} optional open={!!openSecs.photos} onToggle={toggleSec}>
            <PhotosSection photos={draft.photos} onChange={(p) => set({ photos: typeof p === "function" ? p(draft.photos || []) : p })} include={draft.include_photos} onToggleInclude={(v) => set({ include_photos: v })} />
          </Section>
        </div>

        {/* Sticky summary rail */}
        <div className="builder__rail">
          <Card className="summary">
            <div className="section-label" style={{ marginBottom: 6 }}>Quote summary</div>
            <div className="summary__row"><span className="lbl">Materials</span><span className="val">{money(totals.matCents)}</span></div>
            <div className="summary__row"><span className="lbl">Labour</span><span className="val">{money(totals.labCents)}</span></div>
            <div className="summary__divider" />
            <div className="summary__row"><span className="lbl">Subtotal</span><span className="val">{money(totals.subtotal)}</span></div>
            <div className="summary__row"><span className="lbl">Margin ({marginPct}%) {internalBadge}</span><span className="val">{money(totals.margin)}</span></div>
            {draft.gst_enabled && <div className="summary__row"><span className="lbl">GST (10%)</span><span className="val">{money(totals.gst)}</span></div>}
            <div className="summary__divider" />
            <div className="summary__total"><span className="lbl">Total{draft.gst_enabled ? " (inc GST)" : ""}</span><span className="val">{moneyShort(totals.total)}</span></div>
            {!draft.gst_enabled && <div className="summary__gst-note">No GST applied — business is not GST-registered.</div>}

            <div className="summary__actions">
              <Button variant="brand" icon="save" onClick={doSave} disabled={!canSave}>Save draft</Button>
              <Button variant="outline" icon="file-text" onClick={doPreview} disabled={!canSave}>Generate PDF</Button>
              <Button variant="outline" icon="send" onClick={doEmail} disabled={!canSave || !client?.email}>Email to client</Button>
            </div>
            <div style={{ marginTop: 12 }}>
              <span className={`save-state ${saveCls}`}>
                <Icon name={dirty && canSave ? "loader-2" : dirty ? "circle-dot" : savedOnce ? "check" : "circle"} size={12} className={dirty && canSave ? "spin-ic" : ""} />
                {saveLabel}
              </span>
            </div>
            {!canSave && <div style={{ marginTop: 10, font: "400 11px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>Add a client and at least one line item to save.</div>}
            {canSave && !client?.email && <div style={{ marginTop: 10, font: "400 11px/1.4 var(--font-sans)", color: "var(--status-warning)" }}>Client has no email — add one to enable sending.</div>}
          </Card>
        </div>
      </div>

      {/* Sticky mobile total bar */}
      <div className="mbar">
        <div className="mbar__total">
          <span className="mbar__lbl">Total{draft.gst_enabled ? " inc GST" : ""}</span>
          <span className="mbar__val mono">{moneyShort(totals.total)}</span>
          {lowMargin && <span className="mbar__warn" title={`Margin below your ${settings.margin_floor_pct}% floor`}><Icon name="alert-triangle" size={13} />{marginPct}%</span>}
        </div>
        <span className={`save-state mbar__state ${saveCls}`}>
          <Icon name={dirty && canSave ? "loader-2" : dirty ? "circle-dot" : savedOnce ? "check" : "circle"} size={12} className={dirty && canSave ? "spin-ic" : ""} />
        </span>
        <Button variant="brand" icon="save" onClick={doSave} disabled={!canSave}>Save</Button>
      </div>

      {clientModal && <ClientModal initial={clientModal.id ? clientModal : null} onClose={() => setClientModal(null)} onSave={handleClientSave} />}
      {pbOpen && <PriceBookPicker priceBook={priceBook} lineItems={draft.line_items} onAdd={addFromBook} onUpdateQty={updateItemQty} onClose={() => setPbOpen(false)} />}
    </div>
  );
}

window.BuilderScreen = BuilderScreen;
