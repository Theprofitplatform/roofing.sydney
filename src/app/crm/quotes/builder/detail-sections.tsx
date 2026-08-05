"use client";

import { Icon } from "@/components/crm/icon";
import { Field, Input, InternalBadge, Select, Textarea, Toggle } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { Client, PdfLayout } from "@/lib/db/types";
import { Section } from "./section";
import type { DraftQuote } from "./state";

/**
 * The three plain-form steps of the builder: who and where, what the job is,
 * and what it is worth to you. Split out so `builder.tsx` stays about state and
 * saving rather than about markup.
 */

interface SectionShell {
  open: boolean;
  onToggle: (id: string) => void;
  complete: boolean;
}

export function ClientSection({
  draft,
  clients,
  client,
  onPatch,
  onNewClient,
  shell,
}: {
  draft: DraftQuote;
  clients: Client[];
  client: Client | null;
  onPatch: (changes: Partial<DraftQuote>) => void;
  onNewClient: () => void;
  shell: SectionShell;
}) {
  return (
    <Section id="client" num="1" title="Client & property" {...shell}>
      <div className="grid-2">
        <Field label="Client" required>
          <Select
            value={draft.client_id}
            onChange={(e) => {
              if (e.target.value === "__new") onNewClient();
              else onPatch({ client_id: e.target.value });
            }}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">+ Add new client…</option>
          </Select>
        </Field>
        <Field label="Property address">
          <Input
            value={client?.property_address ?? ""}
            readOnly
            placeholder="Set on the client record"
            style={{ color: "var(--muted-foreground)" }}
          />
        </Field>
      </div>

      {client && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginTop: 12,
            font: "400 12px/1.4 var(--font-sans)",
            color: "var(--muted-foreground)",
            flexWrap: "wrap",
          }}
        >
          {client.phone && (
            <span>
              <Icon name="phone" size={12} style={{ marginRight: 5, verticalAlign: "-2px" }} />
              {client.phone}
            </span>
          )}
          <span
            style={{ color: client.email ? "var(--muted-foreground)" : "var(--status-warning)" }}
          >
            <Icon name="mail" size={12} style={{ marginRight: 5, verticalAlign: "-2px" }} />
            {client.email || "No email on file — needed to send"}
          </span>
        </div>
      )}
    </Section>
  );
}

export function JobSection({
  draft,
  onPatch,
  shell,
}: {
  draft: DraftQuote;
  onPatch: (changes: Partial<DraftQuote>) => void;
  shell: SectionShell;
}) {
  return (
    <Section id="job" num="2" title="Job details" {...shell}>
      <div className="grid-2" style={{ marginBottom: 12 }}>
        <Field label="Roof type / job">
          <Input
            value={draft.roof_type}
            onChange={(e) => onPatch({ roof_type: e.target.value })}
            placeholder="e.g. Colorbond Trimdek — full re-roof"
          />
        </Field>
        <Field label="Quote valid for" hint="Days the price holds">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Input
              className="mono"
              style={{ width: 80 }}
              inputMode="numeric"
              value={draft.valid_days}
              onChange={(e) =>
                onPatch({
                  valid_days: Number.parseInt(e.target.value.replace(/[^0-9]/g, ""), 10) || 0,
                })
              }
            />
            <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>
              days
            </span>
          </div>
        </Field>
      </div>

      <Field label="Notes" hint="Shown on the quote above the line items.">
        <Textarea
          value={draft.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder="Scope, access, colour selections, conditions…"
        />
      </Field>

      <div className="toggle-card">
        <div>
          <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>
            Show line-item breakdown on PDF
          </div>
          <div
            style={{
              font: "400 11.5px/1.3 var(--font-sans)",
              color: "var(--muted-foreground)",
              marginTop: 3,
            }}
          >
            Off shows a single &ldquo;supply &amp; install&rdquo; total instead.
          </div>
        </div>
        <Toggle
          on={draft.show_breakdown}
          onChange={(on) => onPatch({ show_breakdown: on })}
          label="Show line-item breakdown"
        />
      </div>

      <div className="toggle-card" style={{ marginTop: 10 }}>
        <div>
          <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>PDF layout</div>
          <div
            style={{
              font: "400 11.5px/1.3 var(--font-sans)",
              color: "var(--muted-foreground)",
              marginTop: 3,
            }}
          >
            Two takes on the branded quote.
          </div>
        </div>
        <div className="seg">
          {(["classic", "modern"] as PdfLayout[]).map((layout) => (
            <button
              key={layout}
              type="button"
              className={`seg__btn ${draft.pdf_layout === layout ? "is-active" : ""}`}
              onClick={() => onPatch({ pdf_layout: layout })}
            >
              {layout === "classic" ? "Classic" : "Modern"}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

export function MarginSection({
  draft,
  onPatch,
  marginCents,
  lowMargin,
  marginFloorPct,
  gstRegistered,
  shell,
}: {
  draft: DraftQuote;
  onPatch: (changes: Partial<DraftQuote>) => void;
  marginCents: number;
  lowMargin: boolean;
  marginFloorPct: number;
  gstRegistered: boolean;
  shell: SectionShell;
}) {
  return (
    <Section id="margin" num="4" title="Margin & tax" {...shell}>
      <div className="grid-2">
        <Field
          label={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Margin % <InternalBadge />
            </span>
          }
          hint={`Adds ${money(marginCents)} to the subtotal`}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Input
              className="mono"
              style={{ width: 90, borderColor: lowMargin ? "var(--status-warning)" : undefined }}
              inputMode="decimal"
              value={draft.margin_pct}
              onChange={(e) => onPatch({ margin_pct: e.target.value.replace(/[^0-9.]/g, "") })}
            />
            <span style={{ font: "400 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>
              %
            </span>
          </div>
        </Field>
        <Field
          label="GST"
          hint={
            !gstRegistered
              ? "Business is not GST-registered — switch it on in Settings first."
              : draft.gst_enabled
                ? `Adds ${draft.gst_rate}% to the total.`
                : "No GST on this quote."
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, height: 38 }}>
            <Toggle
              on={draft.gst_enabled}
              disabled={!gstRegistered}
              onChange={(on) => onPatch({ gst_enabled: on })}
              label={draft.gst_enabled ? `GST on (${draft.gst_rate}%)` : "GST off"}
            />
          </div>
        </Field>
      </div>
      {lowMargin && (
        <div className="inline-warn">
          <Icon name="alert-triangle" size={14} />
          Margin is below your {marginFloorPct}% floor — check this covers your costs.
        </div>
      )}
    </Section>
  );
}
