"use client";

import { useState } from "react";

import { Icon } from "@/components/crm/icon";
import { Button, Checkbox, Field, Input } from "@/components/crm/ui";
import { nextKey, type DraftItem, type PriceBookRow } from "./state";

/**
 * Length × width → a costed bundle of lines.
 *
 * The measurements a roofer takes on site are metres, not line items, and
 * re-roofing quantities are all derived from the same area. Battens carry a ×1.3
 * coverage factor because they run across the sheets rather than under them —
 * the figure is shown rather than hidden so it can be argued with.
 */
const BATTEN_COVERAGE = 1.3;

interface Option {
  key: "sheets" | "insulation" | "battens";
  label: string;
  qty: number;
  unit: string;
  costCents: number;
  note?: string;
}

export function AreaCalc({
  priceBook,
  onAddLines,
}: {
  priceBook: PriceBookRow[];
  onAddLines: (lines: DraftItem[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [picked, setPicked] = useState<Record<Option["key"], boolean>>({
    sheets: true,
    insulation: true,
    battens: true,
  });

  const area = (Number.parseFloat(length) || 0) * (Number.parseFloat(width) || 0);
  const rounded = Math.round(area * 10) / 10;

  const find = (pattern: RegExp) => priceBook.find((p) => pattern.test(p.description));
  const sheets = find(/sheet|trimdek|klip/i);
  const insulation = find(/insulation|anticon/i);
  const battens = find(/batten/i);

  const options: Option[] = [
    {
      key: "sheets",
      label: sheets?.description ?? "Roofing sheets",
      qty: rounded,
      unit: "m2",
      costCents: sheets?.unit_cost_cents ?? 0,
    },
    {
      key: "insulation",
      label: insulation?.description ?? "Insulation blanket",
      qty: rounded,
      unit: "m2",
      costCents: insulation?.unit_cost_cents ?? 0,
    },
    {
      key: "battens",
      label: battens?.description ?? "Battens",
      qty: Math.round(rounded * BATTEN_COVERAGE),
      unit: "m",
      costCents: battens?.unit_cost_cents ?? 0,
      note: `×${BATTEN_COVERAGE} coverage`,
    },
  ];

  const chosen = options.filter((o) => picked[o.key]);

  const addLines = () => {
    const lines: DraftItem[] = (
      chosen.length > 0
        ? chosen.map((o) => ({ description: o.label, qty: o.qty, unit: o.unit, cost: o.costCents }))
        : [{ description: "Roof area", qty: rounded, unit: "m2", cost: 0 }]
    ).map((line) => ({
      key: nextKey(),
      kind: "material" as const,
      description: line.description,
      qty: String(line.qty),
      unit: line.unit,
      unit_cost_cents: line.cost,
      is_optional: false,
      tier: null,
    }));

    onAddLines(lines);
    setLength("");
    setWidth("");
  };

  return (
    <div className="area-calc">
      <button
        type="button"
        className="area-calc__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon name="ruler" size={14} /> Area calculator{" "}
        <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
      </button>

      {open && (
        <div className="area-calc__body">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <Field label="Length (m)" style={{ width: 96 }}>
              <Input
                className="mono"
                inputMode="decimal"
                value={length}
                onChange={(e) => setLength(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </Field>
            <span style={{ paddingBottom: 10, color: "var(--muted-foreground)" }}>×</span>
            <Field label="Width (m)" style={{ width: 96 }}>
              <Input
                className="mono"
                inputMode="decimal"
                value={width}
                onChange={(e) => setWidth(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </Field>
            <div style={{ paddingBottom: 6 }}>
              <div className="field__label">Area</div>
              <div className="mono" style={{ font: "700 18px/1 var(--font-mono)", marginTop: 8 }}>
                {rounded} m²
              </div>
            </div>
          </div>

          <div className="area-bundle">
            {options.map((o) => (
              <div className="area-bundle__row" key={o.key}>
                <Checkbox
                  on={picked[o.key]}
                  onChange={(on) => setPicked((current) => ({ ...current, [o.key]: on }))}
                >
                  {o.label}
                </Checkbox>
                <span className="area-bundle__qty mono">
                  {rounded > 0 ? `${o.qty} ${o.unit === "m2" ? "m²" : o.unit}` : "—"}
                  {o.note && <span className="area-bundle__note"> · {o.note}</span>}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <Button
              variant="subtle"
              size="sm"
              icon="plus"
              disabled={rounded <= 0}
              onClick={addLines}
            >
              {chosen.length > 1
                ? `Add ${chosen.length} lines at ${rounded} m²`
                : chosen.length === 1
                  ? `Add line at ${rounded} m²`
                  : "Add as blank line"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
