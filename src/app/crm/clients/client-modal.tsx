"use client";

import { useState } from "react";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, Select } from "@/components/crm/ui";
import type { ClientInput } from "@/lib/db/clients";
import type { Client } from "@/lib/db/types";

/**
 * Add/edit client — the prototype's `ClientModal`, plus a lead source.
 *
 * Source is on the form because `bySource` in lib/reports.ts turns it into
 * "which marketing to keep paying for". Left free-form it would group as a dozen
 * spellings of "referral", so it is a fixed list — with whatever the row already
 * holds appended, so a value written by lead intake is never silently rewritten.
 */
const SOURCES = ["web", "referral", "phone", "repeat", "walk-in", "other"] as const;

export interface ClientModalProps {
  /** Null opens the modal in "add" mode. */
  initial: Client | null;
  saving: boolean;
  onClose: () => void;
  onSave: (form: ClientInput) => void;
}

export function ClientModal({ initial, saving, onClose, onSave }: ClientModalProps) {
  const editing = initial !== null;
  const [form, setForm] = useState<ClientInput>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    property_address: initial?.property_address ?? "",
    source: initial?.source ?? "",
  });

  const set = (patch: Partial<ClientInput>) => setForm((prev) => ({ ...prev, ...patch }));

  const current = (form.source ?? "").trim();
  const options = SOURCES.includes(current as (typeof SOURCES)[number])
    ? [...SOURCES]
    : [...SOURCES, current].filter(Boolean);

  const submit = () => {
    if (!form.name.trim() || saving) return;
    onSave(form);
  };

  return (
    <Modal
      title={editing ? "Edit client" : "Add client"}
      sub={
        editing
          ? "Updates apply to future quotes and to the contact record."
          : "Save a new client so you can quote for them."
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="brand"
            icon={editing ? "save" : "user-plus"}
            onClick={submit}
            disabled={saving || !form.name.trim()}
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Add client"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Name" required>
          <Input
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Full name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => set({ phone: e.target.value })}
              placeholder="04xx xxx xxx"
              inputMode="tel"
            />
          </Field>
          <Field label="Email" hint="Needed to send a quote">
            <Input
              value={form.email ?? ""}
              onChange={(e) => set({ email: e.target.value })}
              placeholder="name@email.com"
              inputMode="email"
            />
          </Field>
        </div>
        <Field label="Property address">
          <Input
            value={form.property_address ?? ""}
            onChange={(e) => set({ property_address: e.target.value })}
            placeholder="Street, suburb, NSW"
          />
        </Field>
        <Field label="Lead source" hint="Feeds conversion-by-source reporting">
          <Select value={current} onChange={(e) => set({ source: e.target.value })}>
            <option value="">Not recorded</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
