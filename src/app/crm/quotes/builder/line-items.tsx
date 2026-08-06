"use client";

import { useState } from "react";

import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, Checkbox, Input, MoneyInput, Select } from "@/components/crm/ui";
import { lineTotalCents, money } from "@/lib/money";
import type { ItemKind, Tier } from "@/lib/db/types";
import { blankRow, TIER_OPTIONS, UNITS, type DraftItem } from "./state";

type Updater = (updater: (current: DraftItem[]) => DraftItem[]) => void;

/**
 * One group of line items — materials or labour.
 *
 * Reordering is offered twice on purpose. Drag works with a mouse and is
 * unusable with a thumb, so below 560px the stylesheet hides the grip and
 * reveals the chevrons; both drive the same `reorder`, and both refuse to move a
 * material into the labour block.
 */
export function LineItemGroup({
  kind,
  items,
  onChange,
  showOptions,
}: {
  kind: ItemKind;
  items: DraftItem[];
  onChange: Updater;
  showOptions: boolean;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const toast = useToast();

  const isMaterial = kind === "material";
  const group = items.filter((i) => i.kind === kind);

  const baseCost = group
    .filter((i) => !i.is_optional)
    .reduce((sum, i) => sum + lineTotalCents(i), 0);
  const optionalCost = group
    .filter((i) => i.is_optional)
    .reduce((sum, i) => sum + lineTotalCents(i), 0);

  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const remove = (key: string) => {
    const index = items.findIndex((i) => i.key === key);
    const removed = items[index];
    onChange((current) => current.filter((i) => i.key !== key));

    if (removed?.description.trim()) {
      const label =
        removed.description.length > 34
          ? `${removed.description.slice(0, 34)}…`
          : removed.description;
      toast(`Removed "${label}"`, "info", "trash-2", {
        label: "Undo",
        onClick: () =>
          onChange((current) => {
            const next = [...current];
            next.splice(Math.min(index, next.length), 0, removed);
            return next;
          }),
      });
    }
  };

  const reorder = (fromKey: string | null, toKey: string) => {
    if (!fromKey || fromKey === toKey) return;
    onChange((current) => {
      const from = current.findIndex((i) => i.key === fromKey);
      const to = current.findIndex((i) => i.key === toKey);
      // Groups are rendered separately; moving across them would silently
      // reclassify a material as labour.
      if (from < 0 || to < 0 || current[from].kind !== current[to].kind) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const move = (key: string, direction: -1 | 1) => {
    const index = group.findIndex((i) => i.key === key);
    const target = group[index + direction];
    if (target) reorder(key, target.key);
  };

  return (
    <div className="li-group">
      <div className="li-group__head">
        <span
          className="dot"
          style={{ background: isMaterial ? "var(--brand)" : "var(--status-warning)" }}
        />
        <span className="li-group__title">{isMaterial ? "Materials" : "Labour"}</span>
        <span className="li-group__sum">
          {money(baseCost)}
          {optionalCost > 0 && (
            <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>
              {" "}
              + {money(optionalCost)} optional
            </span>
          )}
        </span>
      </div>

      <div className="li-table">
        <div className="li-head">
          <span />
          <span>Description</span>
          <span className="t-right">Qty</span>
          <span>Unit</span>
          <span className="t-right">Unit cost</span>
          <span className="t-right">Total</span>
          <span />
        </div>

        {group.length === 0 && (
          <div
            style={{
              padding: "10px 2px",
              font: "400 12.5px/1.4 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            No {isMaterial ? "materials" : "labour"} added yet.
          </div>
        )}

        {group.map((item, index) => (
          <div
            key={item.key}
            className={`li-row ${dragKey === item.key ? "is-dragging" : ""}`}
            draggable
            onDragStart={() => setDragKey(item.key)}
            onDragEnd={() => setDragKey(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              reorder(dragKey, item.key);
              setDragKey(null);
            }}
          >
            <span className="li-row__grip" title="Drag to reorder">
              <Icon name="grip-vertical" size={14} />
            </span>

            <div className="li-desc">
              <Input
                placeholder={
                  isMaterial
                    ? "e.g. Colorbond Trimdek — Surfmist"
                    : "e.g. Sheet installation (2 crew)"
                }
                value={item.description}
                onChange={(e) => update(item.key, { description: e.target.value })}
              />
            </div>

            <Input
              className="t-right mono"
              inputMode="decimal"
              aria-label="Quantity"
              value={item.qty}
              onChange={(e) => update(item.key, { qty: e.target.value.replace(/[^0-9.]/g, "") })}
            />

            <Select
              value={item.unit}
              aria-label="Unit"
              onChange={(e) => update(item.key, { unit: e.target.value })}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>

            <MoneyInput
              valueCents={item.unit_cost_cents}
              aria-label="Unit cost"
              onChangeCents={(cents) => update(item.key, { unit_cost_cents: cents })}
            />

            <span className="li-row__total">{money(lineTotalCents(item))}</span>

            <span className="li-row__move">
              <button
                type="button"
                className="li-move-btn"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => move(item.key, -1)}
              >
                <Icon name="chevron-up" size={15} />
              </button>
              <button
                type="button"
                className="li-move-btn"
                aria-label="Move down"
                disabled={index === group.length - 1}
                onClick={() => move(item.key, 1)}
              >
                <Icon name="chevron-down" size={15} />
              </button>
            </span>

            <button
              type="button"
              className="li-row__del"
              title="Remove line"
              aria-label="Remove line"
              onClick={() => remove(item.key)}
            >
              <Icon name="trash-2" size={15} />
            </button>

            {(showOptions || item.is_optional || item.tier) && (
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                  padding: "2px 0 6px 25px",
                }}
              >
                <Checkbox
                  on={item.is_optional}
                  onChange={(on) => update(item.key, { is_optional: on })}
                >
                  <span style={{ fontSize: 12 }}>Client-selectable extra</span>
                </Checkbox>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    font: "500 11.5px/1 var(--font-sans)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Option tier
                  <Select
                    style={{ width: 104, padding: "6px 9px", fontSize: 12 }}
                    value={item.tier ?? ""}
                    aria-label="Option tier"
                    onChange={(e) =>
                      update(item.key, { tier: (e.target.value || null) as Tier | null })
                    }
                  >
                    {TIER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        icon="plus"
        className="li-add"
        onClick={() => onChange((current) => [...current, blankRow(kind)])}
      >
        Add {isMaterial ? "material" : "labour"}
      </Button>
    </div>
  );
}
