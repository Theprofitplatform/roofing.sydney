"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, MoneyInput, Select } from "@/components/crm/ui";
import type { PriceBookInput } from "@/lib/db/library";
import type { PriceBookItem } from "@/lib/db/types";

const UNITS = ["ea", "m", "m2", "hr", "day", "L", "item"] as const;

/**
 * Add or edit one price book row.
 *
 * `unit_cost_cents` is the SUPPLIER COST, never a sell price — the quote marks
 * it up by `margin_pct` at build time. Storing a marked-up figure here would
 * double the margin the moment a quote applied its own, so the field says cost
 * on the label and in the hint.
 */
export function PriceBookForm({
  initial,
  categories,
  saving,
  onClose,
  onSave,
}: {
  initial: PriceBookItem | null;
  categories: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: PriceBookInput) => void;
}) {
  const listId = useId();
  const [form, setForm] = useState<PriceBookInput>({
    kind: initial?.kind ?? "material",
    category: initial?.category ?? categories[0] ?? "",
    description: initial?.description ?? "",
    unit: initial?.unit ?? "m2",
    unit_cost_cents: initial?.unit_cost_cents ?? 0,
    supplier: initial?.supplier ?? "",
    supplier_sku: initial?.supplier_sku ?? "",
  });

  const set = (patch: Partial<PriceBookInput>) => setForm((prev) => ({ ...prev, ...patch }));
  const valid = form.description.trim() !== "" && form.category.trim() !== "";

  return (
    <Modal
      title={initial ? "Edit price book item" : "Add price book item"}
      sub={
        initial
          ? "Changing the cost restamps the staleness clock; changing the description does not."
          : "Reusable material or labour you can tap into any quote."
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
            onClick={() => valid && onSave(form)}
            disabled={saving || !valid}
          >
            {saving ? "Saving…" : initial ? "Save changes" : "Add item"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Description" required>
          <Input
            autoFocus
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. Colorbond Trimdek sheets"
          />
        </Field>

        <div className="grid-3">
          <Field label="Kind">
            <Select
              value={form.kind}
              onChange={(e) => set({ kind: e.target.value as PriceBookInput["kind"] })}
            >
              <option value="material">Material</option>
              <option value="labour">Labour</option>
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Unit cost" required hint="Supplier cost — never a sell price">
            <MoneyInput
              valueCents={form.unit_cost_cents}
              onChangeCents={(cents) => set({ unit_cost_cents: cents })}
            />
          </Field>
        </div>

        <Field label="Category" required hint="Groups the picker, and is what a bulk uplift targets">
          <Input
            list={listId}
            value={form.category}
            onChange={(e) => set({ category: e.target.value })}
            placeholder="e.g. Sheet roofing"
          />
        </Field>
        <datalist id={listId}>
          {categories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        <div className="grid-2">
          <Field label="Supplier">
            <Input
              value={form.supplier ?? ""}
              onChange={(e) => set({ supplier: e.target.value })}
              placeholder="e.g. Lysaght"
            />
          </Field>
          <Field label="Supplier SKU" hint="What you quote them when you order">
            <Input
              className="mono"
              value={form.supplier_sku ?? ""}
              onChange={(e) => set({ supplier_sku: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
