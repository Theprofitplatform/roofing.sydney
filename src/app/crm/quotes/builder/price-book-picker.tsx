"use client";

import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { Button } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { DraftItem, PriceBookRow } from "./state";

/**
 * Add costed lines without leaving the builder.
 *
 * The one thing this does beyond the prototype: it flags a cost that has not
 * been confirmed in a while. `margin_floor_pct` guards the MARGIN, not whether
 * the underlying cost is real — 20% on a sheet price that rose 12% in March is
 * not a 20% margin — so the only place that can catch it is here, at the moment
 * the number is used.
 */

/** Recently-used items, so the same six lines are not hunted for every visit. */
const RECENTS_KEY = "arc_pb_recents";
const RECENTS_LIMIT = 6;

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((x) => x !== id)].slice(0, RECENTS_LIMIT);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // A browser with storage disabled loses the shortcut, not the feature.
  }
}

function StaleFlag({ item }: { item: PriceBookRow }) {
  return (
    <span
      className="pill pill--warning pill--no-dot"
      style={{ fontSize: 9.5, padding: "2px 7px", cursor: "help" }}
      title={
        `This cost was last confirmed ${item.costAgeDays} days ago. ` +
        "Your margin floor tests the margin, not whether the cost is still real — " +
        "check it against a current supplier price before you quote on it."
      }
    >
      <Icon name="alert-triangle" size={10} strokeWidth={2.4} />
      {item.costAgeDays}d old
    </span>
  );
}

export function PriceBookPicker({
  priceBook,
  lineItems,
  onAdd,
  onSetQty,
  onClose,
}: {
  priceBook: PriceBookRow[];
  lineItems: DraftItem[];
  /** Adds the line and returns its draft key, so the stepper can drive its qty. */
  onAdd: (item: PriceBookRow) => string;
  onSetQty: (key: string, qty: number) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("all");
  const [added, setAdded] = useState<Record<string, string>>({});
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // localStorage is not available during the server render.
  useEffect(() => setRecentIds(readRecents()), []);

  const needle = term.trim().toLowerCase();
  const categories = useMemo(
    () => [...new Set(priceBook.map((p) => p.category))],
    [priceBook],
  );

  const list = priceBook.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      (!needle ||
        p.description.toLowerCase().includes(needle) ||
        p.category.toLowerCase().includes(needle)),
  );
  const listCategories = [...new Set(list.map((p) => p.category))];
  const recents = recentIds
    .map((id) => priceBook.find((p) => p.id === id))
    .filter((p): p is PriceBookRow => Boolean(p));

  const qtyOf = (priceBookId: string): number => {
    const line = lineItems.find((i) => i.key === added[priceBookId]);
    return line ? Number.parseFloat(line.qty) || 0 : 0;
  };

  const step = (item: PriceBookRow, delta: number) => {
    const key = added[item.id];
    if (key) onSetQty(key, Math.max(1, qtyOf(item.id) + delta));
  };

  const addOne = (item: PriceBookRow) => {
    const key = onAdd(item);
    setAdded((current) => ({ ...current, [item.id]: key }));
    pushRecent(item.id);
  };

  const Row = ({ item }: { item: PriceBookRow }) =>
    added[item.id] ? (
      <div className="pb-item pb-item--added">
        <span className={`pb-item__kind pb-item__kind--${item.kind}`}>
          {item.kind === "material" ? "MAT" : "LAB"}
        </span>
        <span className="pb-item__desc">{item.description}</span>
        <span className="pb-stepper">
          <button
            type="button"
            className="pb-stepper__btn"
            aria-label="Decrease quantity"
            onClick={() => step(item, -1)}
          >
            <Icon name="minus" size={14} />
          </button>
          <span className="pb-stepper__val mono">
            {qtyOf(item.id)}
            <span>{item.unit}</span>
          </span>
          <button
            type="button"
            className="pb-stepper__btn"
            aria-label="Increase quantity"
            onClick={() => step(item, 1)}
          >
            <Icon name="plus" size={14} />
          </button>
        </span>
      </div>
    ) : (
      <button type="button" className="pb-item" onClick={() => addOne(item)}>
        <span className={`pb-item__kind pb-item__kind--${item.kind}`}>
          {item.kind === "material" ? "MAT" : "LAB"}
        </span>
        <span className="pb-item__desc">
          {item.description}
          {item.isStale && (
            <>
              {" "}
              <StaleFlag item={item} />
            </>
          )}
        </span>
        <span className="pb-item__price mono">
          {money(item.unit_cost_cents)}
          <span style={{ color: "var(--muted-foreground)" }}>/{item.unit}</span>
        </span>
        <span className="pb-item__add">
          <Icon name="plus" size={15} />
        </span>
      </button>
    );

  const addedCount = Object.keys(added).length;

  return (
    <Modal
      sheet
      title="Add from price book"
      sub="Tap to add, then set quantities right here."
      onClose={onClose}
      maxWidth={560}
      footer={
        <Button variant="brand" icon="check" onClick={onClose}>
          {addedCount ? `Done · ${addedCount} added` : "Done"}
        </Button>
      }
    >
      <div className="search" style={{ maxWidth: "none", marginBottom: 10 }}>
        <Icon name="search" size={15} />
        <input
          placeholder="Search materials & labour…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search price book"
        />
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${category === "all" ? "is-active" : ""}`}
          onClick={() => setCategory("all")}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={`chip ${category === c ? "is-active" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div style={{ maxHeight: "46vh", overflow: "auto", margin: "0 -4px", padding: "0 4px" }}>
        {category === "all" && !needle && recents.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Recent
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recents.map((item) => (
                <Row key={`recent-${item.id}`} item={item} />
              ))}
            </div>
          </div>
        )}

        {listCategories.map((c) => (
          <div key={c} style={{ marginBottom: 14 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>
              {c}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {list
                .filter((p) => p.category === c)
                .map((item) => (
                  <Row key={item.id} item={item} />
                ))}
            </div>
          </div>
        ))}

        {list.length === 0 && (
          <div
            style={{
              padding: "14px 2px",
              font: "400 13px/1.4 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            Nothing matches — try another term or category.
          </div>
        )}
      </div>
    </Modal>
  );
}
