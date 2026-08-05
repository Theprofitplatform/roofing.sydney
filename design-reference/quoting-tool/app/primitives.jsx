/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---------- Money + calc helpers ---------- */
function money(cents, decimals = 2) {
  const v = (cents || 0) / 100;
  return "$" + v.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function moneyShort(cents) {
  const v = (cents || 0) / 100;
  const whole = Number.isInteger(v);
  return "$" + v.toLocaleString("en-AU", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}
function lineTotalCents(it) { return Math.round((parseFloat(it.qty) || 0) * (it.unit_cost_cents || 0)); }
function computeTotals(quote) {
  const items = quote.line_items || [];
  const materials = items.filter((i) => i.kind === "material");
  const labour = items.filter((i) => i.kind === "labour");
  const matCents = materials.reduce((s, i) => s + lineTotalCents(i), 0);
  const labCents = labour.reduce((s, i) => s + lineTotalCents(i), 0);
  const subtotal = matCents + labCents;
  const marginPct = parseFloat(quote.margin_pct) || 0;
  const margin = Math.round(subtotal * marginPct / 100);
  const preGst = subtotal + margin;
  const gst = quote.gst_enabled ? Math.round(preGst * 0.10) : 0;
  const total = preGst + gst;
  return { matCents, labCents, subtotal, margin, preGst, gst, total };
}
function clientById(id) { return (window.ARC_CLIENTS || []).find((c) => c.id === id); }
function quoteIssued(quote) { return quote.sent_at || quote.created_at || new Date().toISOString(); }

/* Opens the rendered quote PDF in a print window — user saves it as PDF. */
function downloadQuotePdf(quoteNumber) {
  const el = document.querySelector(".pdf");
  if (!el) return false;
  const w = window.open("", "_blank");
  if (!w) return false;
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((n) => (n.tagName === "LINK" ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML))
    .join("\n");
  const clone = el.cloneNode(true);
  clone.style.transform = "none";
  w.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${quoteNumber}</title>${styles}` +
    `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}.pdf{transform:none!important;margin:0 auto;box-shadow:none!important}</style>` +
    `</head><body></body></html>`
  );
  w.document.body.appendChild(w.document.importNode(clone, true));
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 500);
  return true;
}
function validUntil(quote) {
  return new Date(new Date(quoteIssued(quote)).getTime() + (quote.valid_days || 30) * 86400000);
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

/* ---------- Lucide icon ---------- */
function Icon({ name, size = 16, strokeWidth = 2, className = "", style, color }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && window.lucide) {
      ref.current.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", name);
      ref.current.appendChild(i);
      window.lucide.createIcons({ attrs: { "stroke-width": strokeWidth, width: size, height: size } });
    }
  }, [name, size, strokeWidth]);
  return <span ref={ref} className={className} style={{ display: "inline-flex", alignItems: "center", color, ...style }} />;
}

/* ---------- Buttons ---------- */
function Button({ variant = "outline", size, icon, iconRight, children, className = "", ...rest }) {
  const cls = ["btn", `btn--${variant}`, size ? `btn--${size}` : "", className].filter(Boolean).join(" ");
  const isz = size === "sm" ? 14 : 15;
  return (
    <button className={cls} {...rest}>
      {icon && <Icon name={icon} size={isz} />}
      {children}
      {iconRight && <Icon name={iconRight} size={isz} />}
    </button>
  );
}
function IconButton({ icon, size = 16, className = "", ...rest }) {
  const ariaLabel = rest["aria-label"] || rest.title || icon;
  return <button className={`icon-btn ${className}`} aria-label={ariaLabel} {...rest}><Icon name={icon} size={size} /></button>;
}

/* ---------- Pill ---------- */
function StatusPill({ status }) {
  const map = {
    draft: { cls: "draft", label: "Draft" },
    sent: { cls: "sent", label: "Sent" },
    viewed: { cls: "viewed", label: "Viewed" },
    accepted: { cls: "accepted", label: "Accepted" },
  };
  const s = map[status] || map.draft;
  return <span className={`pill pill--${s.cls}`}>{s.label}</span>;
}

/* ---------- Form fields ---------- */
function Field({ label, hint, required, children, style }) {
  return (
    <label className="field" style={style}>
      {label && <span className="field__label">{label}{required && <span className="req">*</span>}</span>}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}
function Input(props) { return <input className={`input ${props.className || ""}`} {...props} />; }
function Textarea(props) { return <textarea className={`textarea ${props.className || ""}`} {...props} />; }
function Select({ children, ...rest }) { return <select className="select" {...rest}>{children}</select>; }
function MoneyInput({ valueCents, onChangeCents, ...rest }) {
  const [text, setText] = useState(valueCents != null ? (valueCents / 100).toString() : "");
  useEffect(() => { setText(valueCents != null ? (valueCents / 100).toString() : ""); }, [valueCents]);
  return (
    <div className="input-prefix">
      <span>$</span>
      <input
        className="input" inputMode="decimal" value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          setText(raw);
          const n = parseFloat(raw);
          onChangeCents(isNaN(n) || n < 0 ? 0 : Math.round(n * 100));
        }}
        {...rest}
      />
    </div>
  );
}

/* ---------- Toggle / checkbox ---------- */
function Toggle({ on, onChange, label }) {
  return (
    <button type="button" className={`toggle ${on ? "is-on" : ""}`} onClick={() => onChange(!on)}>
      <span className="toggle__track" />
      {label && <span className="toggle__label">{label}</span>}
    </button>
  );
}
function Checkbox({ on, onChange, children }) {
  return (
    <div className={`check ${on ? "is-on" : ""}`} onClick={() => onChange(!on)} role="checkbox" aria-checked={on}>
      <span className="check__box"><Icon name="check" size={13} strokeWidth={3} /></span>
      <span className="check__text">{children}</span>
    </div>
  );
}

/* ---------- Card ---------- */
function Card({ children, padding, className = "", style }) {
  return <div className={`card ${padding ? "card--p" : ""} ${className}`} style={style}>{children}</div>;
}

/* ---------- Modal ---------- */
function Modal({ title, sub, onClose, children, footer, maxWidth, sheet }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className={`scrim ${sheet ? "scrim--sheet" : ""}`} onClick={onClose}>
      <div className={`modal ${sheet ? "modal--sheet" : ""}`} style={maxWidth ? { maxWidth } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={typeof title === "string" ? title : undefined}>
        <div className="modal__head">
          <div>
            <div className="modal__title">{title}</div>
            {sub && <div className="modal__sub">{sub}</div>}
          </div>
          <IconButton icon="x" title="Close" onClick={onClose} />
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toasts (global) ---------- */
const ToastCtx = React.createContext(() => {});
function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, kind = "success", icon = "check-circle", action) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind, icon, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6500 : 3200);
  }, []);
  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon name={t.icon} size={17} /> {t.msg}
            {t.action && (
              <button className="toast__action" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast() { return React.useContext(ToastCtx); }

/* ---------- Page header ---------- */
function PageHeader({ crumbs, title, description, actions }) {
  return (
    <header>
      {crumbs && (
        <nav className="crumb">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {c.onClick ? <button onClick={c.onClick}>{c.label}</button> : <span className={i === crumbs.length - 1 ? "current" : ""}>{c.label}</span>}
              {i < crumbs.length - 1 && <span className="sep">›</span>}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="page-head">
        <div className="page-head__title">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </div>
    </header>
  );
}

/* RoofMark — simple geometric roof icon for the brand lockup */
function RoofMark({ size = 20, stroke = "#fff" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.2V20h14v-9.8" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

/* Shared add/edit client modal */
function ClientModal({ initial, onClose, onSave }) {
  const editing = !!(initial && initial.id);
  const [form, setForm] = useState({
    name: initial?.name || "", phone: initial?.phone || "",
    email: initial?.email || "", property_address: initial?.property_address || "",
  });
  const f = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const save = () => { if (form.name.trim()) onSave(form); };
  return (
    <Modal
      title={editing ? "Edit client" : "Add client"}
      sub={editing ? "Updates apply to future quotes and the contact record." : "Save a new client to quote for them."}
      onClose={onClose}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="brand" icon={editing ? "save" : "user-plus"} onClick={save}>{editing ? "Save changes" : "Add client"}</Button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Name" required><Input value={form.name} onChange={f("name")} placeholder="Full name" autoFocus /></Field>
        <div className="grid-2">
          <Field label="Phone"><Input value={form.phone} onChange={f("phone")} placeholder="04xx xxx xxx" /></Field>
          <Field label="Email"><Input value={form.email} onChange={f("email")} placeholder="name@email.com" /></Field>
        </div>
        <Field label="Property address"><Input value={form.property_address} onChange={f("property_address")} placeholder="Street, suburb, NSW" /></Field>
      </div>
    </Modal>
  );
}

Object.assign(window, {
  money, moneyShort, lineTotalCents, computeTotals, clientById, quoteIssued, validUntil, daysBetween, downloadQuotePdf,
  Icon, Button, IconButton, StatusPill, Field, Input, Textarea, Select, MoneyInput,
  Toggle, Checkbox, Card, Modal, ClientModal, ToastHost, useToast, PageHeader, RoofMark,
  useState, useEffect, useRef, useMemo, useCallback,
});
