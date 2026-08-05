/* global React, PageHeader, Button, Icon, IconButton, Card, ClientModal, computeTotals, money, moneyShort, useState, useMemo, useToast */

function ClientsScreen({ clients, quotes, onAddClient, onUpdateClient, onNewQuoteFor }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null = closed; {} = new; client = edit
  const toast = useToast();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return clients
      .map((c) => {
        const cq = quotes.filter((x) => x.client_id === c.id);
        const value = cq.reduce((s, x) => s + computeTotals(x).total, 0);
        return { c, count: cq.length, value };
      })
      .filter(({ c }) => !term || c.name.toLowerCase().includes(term) || (c.property_address || "").toLowerCase().includes(term));
  }, [clients, quotes, q]);

  const handleSave = (data) => {
    if (editing && editing.id) { onUpdateClient(editing.id, data); toast("Client updated", "success", "check-circle"); }
    else { onAddClient(data); toast("Client added", "success", "user-plus"); }
    setEditing(null);
  };

  return (
    <div className="stack-6">
      <PageHeader title="Clients" description="People and properties you've quoted. Click a client to edit their details." actions={<Button variant="brand" icon="user-plus" onClick={() => setEditing({})}>Add client</Button>} />
      <div>
        <div className="search" style={{ marginBottom: 14 }}>
          <Icon name="search" size={15} />
          <input placeholder="Search name or address…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap table-wrap--cards">
          <table className="table table--cards">
            <thead>
              <tr><th>Client</th><th>Contact</th><th>Property</th><th className="t-right" style={{ width: 80 }}>Quotes</th><th className="t-right" style={{ width: 120 }}>Value</th><th style={{ width: 88 }} /></tr>
            </thead>
            <tbody>
              {rows.map(({ c, count, value }) => (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td data-label="Client" style={{ fontWeight: 600 }}>{c.name}</td>
                  <td data-label="Contact" className="cell-stack">
                    <div className="mono" style={{ fontSize: 12 }}>{c.phone || "—"}</div>
                    <div style={{ fontSize: 11.5, color: c.email ? "var(--muted-foreground)" : "var(--status-warning)", marginTop: 2 }}>{c.email || "No email"}</div>
                  </td>
                  <td data-label="Property" className="cell-stack" style={{ color: "var(--muted-foreground)", fontSize: 12.5 }}>{c.property_address}</td>
                  <td className="num" data-label="Quotes">{count}</td>
                  <td className="num" data-label="Value" style={{ fontWeight: 600 }}>{moneyShort(value)}</td>
                  <td className="t-right cell-action" data-label="" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "inline-flex", gap: 2 }}>
                      <IconButton icon="pen-line" size={14} title="Edit client" onClick={() => setEditing(c)} />
                      <IconButton icon="file-plus" size={15} title="New quote" onClick={() => onNewQuoteFor(c.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && <ClientModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={handleSave} />}
    </div>
  );
}

window.ClientsScreen = ClientsScreen;
