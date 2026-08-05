"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, EmptyState, IconButton, PageHeader } from "@/components/crm/ui";
import { moneyShort } from "@/lib/money";
import type { ClientInput } from "@/lib/db/clients";
import type { Client } from "@/lib/db/types";
import { createClientAction, updateClientAction } from "./actions";
import { ClientModal } from "./client-modal";

export interface ClientRow {
  client: Client;
  /** Quotes that still stand — a superseded parent is not counted twice. */
  count: number;
  valueCents: number;
}

export function ClientsScreen({ rows }: { rows: ClientRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState("");
  // null = closed, "new" = add, a Client = edit that client.
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      ({ client }) =>
        client.name.toLowerCase().includes(q) ||
        (client.property_address ?? "").toLowerCase().includes(q),
    );
  }, [rows, term]);

  const save = (form: ClientInput) => {
    const target = editing;
    startTransition(async () => {
      const result =
        target && target !== "new"
          ? await updateClientAction(target.id, form)
          : await createClientAction(form);

      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setEditing(null);
      toast(
        target && target !== "new" ? "Client updated" : "Client added",
        "success",
        target && target !== "new" ? "check-circle" : "user-plus",
      );
    });
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Clients"
        description="People and properties you have quoted. Open a client for their full history."
        actions={
          <Button variant="brand" icon="user-plus" onClick={() => setEditing("new")}>
            Add client
          </Button>
        }
      />

      <div>
        <div className="search" style={{ marginBottom: 14 }}>
          <Icon name="search" size={15} />
          <input
            placeholder="Search name or address…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Search clients"
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon="users"
            title="No clients yet"
            actions={
              <Button variant="brand" icon="user-plus" onClick={() => setEditing("new")}>
                Add your first client
              </Button>
            }
          >
            Clients arrive here from the public enquiry form, or you can add one by hand.
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon="search" title="No matches">
            Nothing matches “{term.trim()}”. Try a suburb or part of a surname.
          </EmptyState>
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Property</th>
                  <th className="t-right" style={{ width: 80 }}>
                    Quotes
                  </th>
                  <th className="t-right" style={{ width: 120 }}>
                    Value
                  </th>
                  <th style={{ width: 88 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ client, count, valueCents }) => (
                  <tr key={client.id} onClick={() => router.push(`/clients/${client.id}`)}>
                    <td data-label="Client" style={{ fontWeight: 600 }}>
                      {client.name}
                    </td>
                    <td data-label="Contact" className="cell-stack">
                      <div className="mono" style={{ fontSize: 12 }}>
                        {client.phone || "—"}
                      </div>
                      <div
                        style={{
                          fontSize: 11.5,
                          marginTop: 2,
                          // No email means no quote can be sent — worth flagging
                          // on the row rather than at the moment of sending.
                          color: client.email
                            ? "var(--muted-foreground)"
                            : "var(--status-warning)",
                        }}
                      >
                        {client.email || "No email"}
                      </div>
                    </td>
                    <td
                      data-label="Property"
                      className="cell-stack"
                      style={{ color: "var(--muted-foreground)", fontSize: 12.5 }}
                    >
                      {client.property_address || "—"}
                    </td>
                    <td className="num" data-label="Quotes">
                      {count}
                    </td>
                    <td className="num" data-label="Value" style={{ fontWeight: 600 }}>
                      {moneyShort(valueCents)}
                    </td>
                    <td
                      className="t-right cell-action"
                      data-label=""
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ display: "inline-flex", gap: 2 }}>
                        <IconButton
                          icon="pen-line"
                          size={14}
                          title="Edit client"
                          onClick={() => setEditing(client)}
                        />
                        <IconButton
                          icon="file-plus"
                          size={15}
                          title="New quote for this client"
                          onClick={() => router.push(`/quotes/new?client=${client.id}`)}
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

      {editing && (
        <ClientModal
          initial={editing === "new" ? null : editing}
          saving={pending}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}
