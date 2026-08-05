"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import {
  Button,
  Card,
  PageHeader,
  QuoteStatusPill,
  SectionLabel,
} from "@/components/crm/ui";
import { moneyShort } from "@/lib/money";
import { nudgeLevel, nudgeText, quoteFlags } from "@/lib/quote-state";
import { quoteValueCents } from "@/lib/reports";
import type { QuoteListRow } from "@/lib/db/quotes";
import type { ClientInput } from "@/lib/db/clients";
import type {
  Activity,
  Client,
  Opportunity,
  PipelineStage,
  Settings,
} from "@/lib/db/types";
import { deleteClientAction, updateClientAction } from "../actions";
import { ClientModal } from "../client-modal";
import { fmtDay, fmtMoment } from "../dates";
import { ActivityTimeline } from "./activity-timeline";

export interface ClientDetailProps {
  client: Client;
  opportunities: Opportunity[];
  stages: PipelineStage[];
  quotes: QuoteListRow[];
  activities: Activity[];
  settings: Pick<Settings, "follow_up_days">;
}

export function ClientDetail({
  client,
  opportunities,
  stages,
  quotes,
  activities,
  settings,
}: ClientDetailProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stageLabel = (id: string) => stages.find((s) => s.id === id)?.label ?? id;

  const save = (form: ClientInput) =>
    startTransition(async () => {
      const result = await updateClientAction(client.id, form);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setEditing(false);
      toast("Client updated", "success", "check-circle");
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteClientAction(client.id);
      if (!result.ok) {
        setConfirmDelete(false);
        // Long-form because the refusal has a reason worth reading, and a toast
        // that just says "failed" would send the operator hunting for a bug.
        toast(result.error, "warning", "alert-triangle");
        return;
      }
      toast("Client deleted", "info", "trash-2");
      router.push("/clients");
    });

  return (
    <div className="stack-6">
      <PageHeader
        crumbs={[{ label: "Clients", href: "/clients" }, { label: client.name }]}
        title={client.name}
        description={client.property_address ?? "No property address recorded"}
        actions={
          <>
            <Button icon="pen-line" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="brand"
              icon="file-plus"
              onClick={() => router.push(`/quotes/new?client=${client.id}`)}
            >
              New quote
            </Button>
          </>
        }
      />

      <div className="qview">
        <div className="qview__rail">
          <Card padding>
            <div className="card-head">
              <div className="card-title">Contact</div>
            </div>
            <div className="meta-row">
              <span className="k">Phone</span>
              <span className="v mono">
                {client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : "—"}
              </span>
            </div>
            <div className="meta-row">
              <span className="k">Email</span>
              <span
                className="v"
                style={{ color: client.email ? undefined : "var(--status-warning)" }}
              >
                {client.email ? (
                  <a href={`mailto:${client.email}`}>{client.email}</a>
                ) : (
                  "None — a quote cannot be emailed"
                )}
              </span>
            </div>
            <div className="meta-row">
              <span className="k">Property</span>
              <span className="v" style={{ whiteSpace: "normal", textAlign: "right" }}>
                {client.property_address ?? "—"}
              </span>
            </div>
            <div className="meta-row">
              <span className="k">Source</span>
              <span className="v">{client.source ?? "Not recorded"}</span>
            </div>
            <div className="meta-row">
              <span className="k">On file since</span>
              <span className="v">{fmtDay(client.created_at)}</span>
            </div>
          </Card>

          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Pipeline</div>
                <div className="card-sub">Opportunities on the board for this client.</div>
              </div>
            </div>
            {opportunities.length === 0 ? (
              <div
                style={{
                  font: "400 12.5px/1.4 var(--font-sans)",
                  color: "var(--muted-foreground)",
                }}
              >
                No open opportunities.{" "}
                <Link href="/pipeline">Open the board</Link> to raise one.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {opportunities.map((opp) => (
                  <div key={opp.id} className="pb-item" style={{ cursor: "default" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "500 13px/1.3 var(--font-sans)" }}>
                        {opp.title ?? opp.roof_type ?? "Untitled opportunity"}
                      </div>
                      <div
                        style={{
                          font: "400 11px/1.2 var(--font-sans)",
                          color: "var(--muted-foreground)",
                          marginTop: 3,
                        }}
                      >
                        {opp.visit_at
                          ? `Site visit ${fmtMoment(opp.visit_at)}`
                          : `Updated ${fmtDay(opp.updated_at)}`}
                        {opp.lost_reason ? ` · lost: ${opp.lost_reason.replace(/_/g, " ")}` : ""}
                      </div>
                    </div>
                    <span className="pill pill--draft">{stageLabel(opp.stage_id)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padding>
            <SectionLabel>Danger zone</SectionLabel>
            <p
              style={{
                margin: "8px 0 12px",
                font: "400 12px/1.5 var(--font-sans)",
                color: "var(--muted-foreground)",
              }}
            >
              A client with quotes against them cannot be deleted — a quote has to
              keep the person it was sent to.
            </p>
            <Button
              variant="danger"
              size="sm"
              icon="trash-2"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              Delete client
            </Button>
          </Card>
        </div>

        <div className="qview__main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Quotes</div>
                <div className="card-sub">
                  {quotes.length === 0
                    ? "Nothing quoted yet."
                    : `${quotes.length} quote${quotes.length === 1 ? "" : "s"} on record.`}
                </div>
              </div>
              <Button
                variant="subtle"
                size="sm"
                icon="file-plus"
                onClick={() => router.push(`/quotes/new?client=${client.id}`)}
              >
                New quote
              </Button>
            </div>

            {quotes.length === 0 ? (
              <div
                style={{
                  font: "400 13px/1.4 var(--font-sans)",
                  color: "var(--muted-foreground)",
                }}
              >
                No quotes for this client yet.
              </div>
            ) : (
              <div className="table-wrap table-wrap--cards">
                <table className="table table--cards">
                  <thead>
                    <tr>
                      <th>Quote</th>
                      <th>Status</th>
                      <th>Issued</th>
                      <th className="t-right" style={{ width: 130 }}>
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((row) => {
                      const flags = quoteFlags(row.quote, settings);
                      const nudge = nudgeText(flags);
                      const level = nudgeLevel(flags);
                      return (
                        <tr
                          key={row.quote.id}
                          onClick={() => router.push(`/quotes/${row.quote.id}`)}
                        >
                          <td data-label="Quote" className="cell-stack">
                            <span className="mono" style={{ fontWeight: 600 }}>
                              {row.quote.quote_number ?? "DRAFT"}
                            </span>
                            <span
                              style={{
                                fontSize: 11.5,
                                color: "var(--muted-foreground)",
                                marginTop: 2,
                              }}
                            >
                              {row.quote.roof_type ?? "No job type"}
                              {row.quote.version > 1 ? ` · v${row.quote.version}` : ""}
                            </span>
                          </td>
                          <td data-label="Status" className="cell-stack">
                            <QuoteStatusPill quote={row.quote} />
                            {nudge && level && (
                              <span className={`nudge nudge--${level}`}>{nudge}</span>
                            )}
                          </td>
                          <td
                            data-label="Issued"
                            style={{ color: "var(--muted-foreground)", fontSize: 12.5 }}
                          >
                            {row.quote.sent_at ? fmtDay(row.quote.sent_at) : "Not issued"}
                          </td>
                          <td className="num" data-label="Value" style={{ fontWeight: 600 }}>
                            {moneyShort(
                              quoteValueCents({
                                quote: row.quote,
                                items: row.items,
                                selectedItemIds: row.selectedItemIds,
                              }),
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <ActivityTimeline clientId={client.id} activities={activities} />
        </div>
      </div>

      {editing && (
        <ClientModal
          initial={client}
          saving={pending}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <Modal
          title="Delete this client?"
          sub={client.name}
          maxWidth={440}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="danger" icon="trash-2" onClick={remove} disabled={pending}>
                {pending ? "Deleting…" : "Delete client"}
              </Button>
            </>
          }
        >
          <div className="inline-warn" style={{ marginTop: 0 }}>
            <Icon name="alert-triangle" size={15} />
            Their opportunities and logged history go with them. Quotes do not — if
            any exist, the deletion is refused.
          </div>
        </Modal>
      )}
    </div>
  );
}
