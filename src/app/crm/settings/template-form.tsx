"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, Select, Textarea, Toggle } from "@/components/crm/ui";
import type { TemplateInput } from "@/lib/db/library";
import type { JobTemplate } from "@/lib/db/types";

/** Names that exist in the shared ICONS map and read like roofing work. */
const ICON_CHOICES = [
  "layers",
  "corner-down-right",
  "droplets",
  "ruler",
  "camera",
  "clipboard",
  "file-text",
  "briefcase",
  "receipt",
] as const;

type Draft = {
  label: string;
  sub: string;
  icon: string;
  roof_type: string;
  valid_days: string;
  margin_pct: string;
  show_breakdown: boolean;
  notes: string;
};

export function TemplateForm({
  initial,
  saving,
  onClose,
  onSave,
}: {
  initial: JobTemplate | null;
  saving: boolean;
  onClose: () => void;
  onSave: (patch: Partial<TemplateInput>) => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    label: initial?.label ?? "",
    sub: initial?.sub ?? "",
    icon: initial?.icon ?? ICON_CHOICES[0],
    roof_type: initial?.roof_type ?? "",
    // Blank means "fall back to the settings default", which is why these are
    // held as text rather than coerced to zero.
    valid_days: initial?.valid_days != null ? String(initial.valid_days) : "",
    margin_pct: initial?.margin_pct != null ? String(initial.margin_pct) : "",
    show_breakdown: initial?.show_breakdown ?? true,
    notes: initial?.notes ?? "",
  });

  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const valid = draft.label.trim() !== "";

  const submit = () =>
    onSave({
      label: draft.label.trim(),
      sub: draft.sub.trim() || null,
      icon: draft.icon || null,
      roof_type: draft.roof_type.trim() || null,
      valid_days: draft.valid_days === "" ? null : Number(draft.valid_days),
      margin_pct: draft.margin_pct === "" ? null : Number(draft.margin_pct),
      show_breakdown: draft.show_breakdown,
      notes: draft.notes.trim() || null,
    });

  return (
    <Modal
      title={initial ? "Edit template" : "New template"}
      sub={
        initial
          ? `${initial.line_items.length} line item${initial.line_items.length === 1 ? "" : "s"} — edit those by saving a quote over this template.`
          : "A starting point for a new quote. Line items come from “save this quote as a template”."
      }
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="brand"
            icon={initial ? "save" : "plus"}
            onClick={() => valid && submit()}
            disabled={saving || !valid}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Create template"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Name" required>
          <Input
            autoFocus
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            placeholder="e.g. Full re-roof"
          />
        </Field>

        <Field label="One-line description">
          <Input
            value={draft.sub}
            onChange={(e) => set({ sub: e.target.value })}
            placeholder="e.g. Strip tiles, new sheets, insulation & battens"
          />
        </Field>

        <div className="grid-2">
          <Field label="Icon">
            <Select value={draft.icon} onChange={(e) => set({ icon: e.target.value })}>
              {ICON_CHOICES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preview">
            <span
              className="tpl-item__icon"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            >
              <Icon name={draft.icon} size={18} />
            </span>
          </Field>
        </div>

        <Field label="Job type" hint="Pre-fills the quote's roof type, and groups reporting">
          <Input
            value={draft.roof_type}
            onChange={(e) => set({ roof_type: e.target.value })}
            placeholder="e.g. Colorbond — full re-roof"
          />
        </Field>

        <div className="grid-2">
          <Field label="Valid for (days)" hint="Blank uses the default in Settings → Defaults">
            <Input
              className="mono"
              inputMode="numeric"
              value={draft.valid_days}
              onChange={(e) => set({ valid_days: e.target.value.replace(/[^0-9]/g, "") })}
            />
          </Field>
          <Field label="Margin %" hint="Blank uses the default margin">
            <Input
              className="mono"
              inputMode="decimal"
              value={draft.margin_pct}
              onChange={(e) => set({ margin_pct: e.target.value.replace(/[^0-9.]/g, "") })}
            />
          </Field>
        </div>

        <div className="toggle-card" role="group" aria-labelledby="tpl-breakdown-label">
          <div>
            <div id="tpl-breakdown-label" style={{ font: "600 13px/1.2 var(--font-sans)" }}>
              Itemised breakdown
            </div>
            <div
              style={{
                font: "400 11.5px/1.4 var(--font-sans)",
                color: "var(--muted-foreground)",
                marginTop: 3,
              }}
            >
              Prints marked-up line prices on the client PDF. Off shows one total.
            </div>
          </div>
          <Toggle on={draft.show_breakdown} onChange={(v) => set({ show_breakdown: v })} />
        </div>

        <Field label="Scope notes" hint="Copied into the quote as its opening description">
          <Textarea
            style={{ minHeight: 96 }}
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      </div>
    </Modal>
  );
}
