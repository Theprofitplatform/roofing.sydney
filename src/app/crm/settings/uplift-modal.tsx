"use client";

import { useState } from "react";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, Select } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { PriceBookItem } from "@/lib/db/types";

const ALL = "__all__";

/**
 * Bulk uplift — "+6% on all Sheet roofing" after a supplier letter, rather than
 * fourteen hand edits.
 *
 * Behind a confirmation that states how many rows will change and shows the
 * arithmetic on a real row, because this is the one control in the app that can
 * silently reprice the whole book. Archived rows are never touched: they are the
 * record of what a past quote was costed against.
 */
export function UpliftModal({
  items,
  saving,
  onClose,
  onConfirm,
}: {
  /** Live (non-archived) rows only — what the uplift can actually reach. */
  items: PriceBookItem[];
  saving: boolean;
  onClose: () => void;
  onConfirm: (category: string | null, pct: number) => void;
}) {
  const [category, setCategory] = useState(ALL);
  const [pctText, setPctText] = useState("6");

  const categories = [...new Set(items.map((item) => item.category))].sort();
  const affected = category === ALL ? items : items.filter((i) => i.category === category);
  const pct = Number(pctText);
  const valid = Number.isFinite(pct) && pct !== 0 && pct >= -100 && affected.length > 0;

  const sample = affected[0];
  const preview = sample ? Math.round(sample.unit_cost_cents * (1 + pct / 100)) : 0;

  return (
    <Modal
      title="Bulk uplift"
      sub="Applies a percentage to every live cost in the selection."
      maxWidth={520}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="brand"
            icon="trending-up"
            disabled={saving || !valid}
            onClick={() => onConfirm(category === ALL ? null : category, pct)}
          >
            {saving ? "Applying…" : `Apply to ${affected.length} item${affected.length === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value={ALL}>All categories ({items.length} items)</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name} ({items.filter((i) => i.category === name).length} items)
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Change by %" hint="Negative to reduce — e.g. -3 after a discount was won">
          <Input
            className="mono"
            inputMode="decimal"
            value={pctText}
            onChange={(e) => setPctText(e.target.value.replace(/[^0-9.-]/g, ""))}
          />
        </Field>

        {sample && valid && (
          <div className="attach">
            <span className="attach__icon" style={{ background: "var(--brand-tint-12)", color: "var(--brand)" }}>
              <Icon name="trending-up" size={16} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="attach__name">
                {affected.length} item{affected.length === 1 ? "" : "s"} will be repriced
              </div>
              <div className="attach__size">
                e.g. {sample.description} — {money(sample.unit_cost_cents)} → {money(preview)} /
                {sample.unit}
              </div>
            </div>
          </div>
        )}

        <div className="inline-warn" style={{ marginTop: 0 }}>
          <Icon name="alert-triangle" size={15} />
          There is no undo. Quotes already issued keep the costs they were built
          on; drafts you reopen will price from the new figures.
        </div>
      </div>
    </Modal>
  );
}
