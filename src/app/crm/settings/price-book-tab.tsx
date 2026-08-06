"use client";

import { useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, Card, IconButton, InternalBadge } from "@/components/crm/ui";
import type { PriceBookInput } from "@/lib/db/library";
import { money } from "@/lib/money";
import type { PriceBookItem } from "@/lib/db/types";
import {
  archivePriceBookAction,
  createPriceBookAction,
  updatePriceBookAction,
  upliftPriceBookAction,
} from "./actions";
import { PriceBookForm } from "./price-book-form";
import { UpliftModal } from "./uplift-modal";

const ALL = "__all__";

/**
 * Staleness is decided on the server: `isCostStale` and `STALE_COST_DAYS` live
 * in the server-only db layer, and a client component that imported them would
 * fail the build. Passing the verdict down also means the age shown is measured
 * against the render, not against however long the tab has been open.
 */
export interface PriceBookRow {
  item: PriceBookItem;
  ageDays: number;
  stale: boolean;
}

export function PriceBookTab({
  rows,
  staleAfterDays,
}: {
  rows: PriceBookRow[];
  staleAfterDays: number;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState(ALL);
  const [term, setTerm] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PriceBookItem | "new" | null>(null);
  const [uplifting, setUplifting] = useState(false);

  const live = useMemo(() => rows.filter((r) => !r.item.archived_at), [rows]);
  const categories = useMemo(
    () => [...new Set(live.map((r) => r.item.category))].sort(),
    [live],
  );

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    return rows.filter(({ item }) => {
      if (!showArchived && item.archived_at) return false;
      if (category !== ALL && item.category !== category) return false;
      if (!q) return true;
      return (
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.supplier ?? "").toLowerCase().includes(q) ||
        (item.supplier_sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, category, term, showArchived]);

  const staleCount = live.filter((r) => r.stale).length;
  const archivedCount = rows.length - live.length;

  const save = (input: PriceBookInput) => {
    const target = editing;
    startTransition(async () => {
      const result =
        target && target !== "new"
          ? await updatePriceBookAction(target.id, input)
          : await createPriceBookAction(input);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setEditing(null);
      toast(target && target !== "new" ? "Item updated" : "Item added", "success", "check-circle");
    });
  };

  const archive = (item: PriceBookItem) =>
    startTransition(async () => {
      const result = await archivePriceBookAction(item.id);
      if (result.ok) toast(`“${item.description}” archived`, "info", "ban");
      else toast(result.error, "error");
    });

  const uplift = (target: string | null, pct: number) =>
    startTransition(async () => {
      const result = await upliftPriceBookAction(target, pct);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setUplifting(false);
      toast(
        `Repriced ${result.changed} item${result.changed === 1 ? "" : "s"} by ${pct > 0 ? "+" : ""}${pct}%`,
        "success",
        "trending-up",
      );
    });

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">
            Price book <InternalBadge />
          </div>
          <div className="card-sub">
            Supplier costs you can tap into any quote. The client never sees these
            figures — the quote marks them up by its margin.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            variant="outline"
            size="sm"
            icon="trending-up"
            onClick={() => setUplifting(true)}
            disabled={live.length === 0}
          >
            Bulk uplift
          </Button>
          <Button variant="subtle" size="sm" icon="plus" onClick={() => setEditing("new")}>
            Add item
          </Button>
        </div>
      </div>

      {staleCount > 0 && (
        <div className="inline-warn" style={{ marginTop: 0, marginBottom: 14 }}>
          <Icon name="alert-triangle" size={15} />
          {staleCount} cost{staleCount === 1 ? " has" : "s have"} not been confirmed
          in {staleAfterDays} days. The margin floor will not catch this — it
          tests the margin, not whether the cost underneath it is still real.
        </div>
      )}

      <div className="search" style={{ marginBottom: 12 }}>
        <Icon name="search" size={15} />
        <input
          placeholder="Search description, supplier or SKU…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label="Search the price book"
        />
      </div>

      <div className="chip-row">
        <button
          type="button"
          className={`chip ${category === ALL ? "is-active" : ""}`}
          onClick={() => setCategory(ALL)}
        >
          All ({live.length})
        </button>
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            className={`chip ${category === name ? "is-active" : ""}`}
            onClick={() => setCategory(name)}
          >
            {name} ({live.filter((r) => r.item.category === name).length})
          </button>
        ))}
      </div>

      <div>
        {visible.map(({ item, ageDays, stale }) => {
          const archived = !!item.archived_at;
          return (
            <div
              className="snippet-row"
              key={item.id}
              style={{ alignItems: "center", opacity: archived ? 0.55 : 1 }}
            >
              <span className={`pb-item__kind pb-item__kind--${item.kind}`}>
                {item.kind === "material" ? "MAT" : "LAB"}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "500 13px/1.3 var(--font-sans)" }}>
                  {item.description}
                  {archived && (
                    <span className="pill pill--draft" style={{ marginLeft: 8 }}>
                      Archived
                    </span>
                  )}
                </div>
                <div
                  style={{
                    font: "400 11px/1.3 var(--font-sans)",
                    color: "var(--muted-foreground)",
                    marginTop: 3,
                  }}
                >
                  {item.category}
                  {item.supplier ? ` · ${item.supplier}` : ""}
                  {item.supplier_sku ? ` · ${item.supplier_sku}` : ""}
                </div>
                {stale && !archived && (
                  <div className="nudge nudge--warning">
                    cost unconfirmed for {ageDays} days
                  </div>
                )}
              </div>

              <span className="mono" style={{ font: "500 12.5px/1 var(--font-mono)" }}>
                {money(item.unit_cost_cents)}
                <span style={{ color: "var(--muted-foreground)" }}>/{item.unit}</span>
              </span>

              {!archived && (
                <div className="snippet-row__actions">
                  <IconButton
                    icon="pen-line"
                    size={14}
                    title="Edit item"
                    onClick={() => setEditing(item)}
                  />
                  <IconButton
                    icon="ban"
                    size={14}
                    title="Archive item"
                    onClick={() => archive(item)}
                    disabled={pending}
                  />
                </div>
              )}
            </div>
          );
        })}

        {visible.length === 0 && (
          <div
            style={{
              padding: "10px 0",
              font: "400 13px/1.4 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            Nothing here yet.
          </div>
        )}
      </div>

      {archivedCount > 0 && (
        <div style={{ marginTop: 14 }}>
          <Button
            variant="ghost"
            size="sm"
            icon={showArchived ? "eye-off" : "eye"}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? "Hide" : "Show"} {archivedCount} archived item
            {archivedCount === 1 ? "" : "s"}
          </Button>
          <p
            style={{
              margin: "8px 0 0",
              font: "400 11.5px/1.5 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            Items are archived rather than deleted: a quote sent last year was
            priced from one of these rows, and removing it would strand the audit
            trail behind that figure.
          </p>
        </div>
      )}

      {editing && (
        <PriceBookForm
          initial={editing === "new" ? null : editing}
          categories={categories}
          saving={pending}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      {uplifting && (
        <UpliftModal
          items={live.map((r) => r.item)}
          saving={pending}
          onClose={() => setUplifting(false)}
          onConfirm={uplift}
        />
      )}
    </Card>
  );
}
