/* global React, RoofMark, Icon, IconButton */

function Sidebar({ active, onNavigate, navOpen, onClose }) {
  const b = window.ARC_BUSINESS || {};
  const initials = (b.owner_name || "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "—";
  const groups = [
    { title: "Workspace", items: [
      { id: "quotes", label: "Quotes", icon: "file-text" },
      { id: "clients", label: "Clients", icon: "users" },
    ]},
    { title: "Business", items: [
      { id: "settings", label: "Settings", icon: "settings" },
    ]},
  ];
  const isActive = (id) => active === id || (id === "quotes" && (active === "builder" || active === "view"));
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <span className="brand-mark">{b.logo_data ? <img src={b.logo_data} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} /> : <RoofMark size={20} />}</span>
        <div style={{ minWidth: 0 }}>
          <div className="sb-brand__name">{b.business_name}</div>
          <div className="sb-brand__tag">Quoting · Internal</div>
        </div>
      </div>

      <nav className="sb-nav">
        {groups.map((g) => (
          <div key={g.title} className="nav-group">
            <div className="nav-group__label">{g.title}</div>
            <ul>
              {g.items.map((it) => (
                <li key={it.id}>
                  <button
                    className={`nav-item ${isActive(it.id) ? "is-active" : ""}`}
                    onClick={() => { onNavigate(it.id); onClose && onClose(); }}
                  >
                    <Icon name={it.icon} size={16} />
                    <span className="nav-label">{it.label}</span>
                    {it.badge != null && <span className="nav-item__badge">{it.badge}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <span className="sb-foot__avatar">{initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-foot__name">{b.owner_name}</div>
          <div className="sb-foot__role">Owner · Licence {b.licence_no}</div>
        </div>
        <IconButton icon="log-out" title="Sign out" aria-label="Sign out" />
      </div>
    </aside>
  );
}

function Topbar({ onHamburger, onNewQuote }) {
  const b = window.ARC_BUSINESS;
  return (
    <div className="topbar">
      <button className="icon-btn topbar__hamburger" aria-label="Open navigation" onClick={onHamburger}><Icon name="menu" size={18} /></button>
      <div className="topbar__id">
        <span className="lic">ABN {b.abn}</span>
        <span className="sep">·</span>
        <span className="pill pill--draft pill--no-dot" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>Not GST registered</span>
      </div>
      <div className="topbar__spacer" />
      <button className="btn btn--ghost btn--sm" onClick={() => window.scrollTo({ top: 0 })}><Icon name="life-buoy" size={15} />Help</button>
      <button className="btn btn--brand btn--sm" onClick={onNewQuote}><Icon name="plus" size={15} />New quote</button>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar });
