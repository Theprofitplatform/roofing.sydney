"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, PageHeader } from "@/components/crm/ui";
import { isBelowMarginFloor, moneyShort } from "@/lib/money";
import { offeredTiers, optionalExtras, priceSelection, tierPrices } from "@/lib/quote-pricing";
import type { Client, Snippet, Tier } from "@/lib/db/types";

import { saveDraft } from "../actions";
import type { PhotoView } from "../helpers";
import { AreaCalc } from "./area-calc";
import { ClauseSection } from "./clauses";
import { NewClientModal } from "./client-modal";
import { ClientSection, JobSection, MarginSection } from "./detail-sections";
import { LineItemGroup } from "./line-items";
import { PhotosSection } from "./photos";
import { PriceBookPicker } from "./price-book-picker";
import { Section } from "./section";
import { SaveStateBadge, SummaryRail, type SaveStatus } from "./summary-rail";
import {
  describedItems,
  nextKey,
  toCalcQuote,
  toSavePayload,
  toScopeItems,
  type DraftItem,
  type DraftQuote,
  type PriceBookRow,
} from "./state";

/**
 * The builder.
 *
 * Two rules shape everything here. Line items hold supplier COST and the margin
 * is applied on the way out, so every figure on this screen is internal and the
 * ones that would embarrass you in front of a client are marked. And a quote
 * becomes immutable the moment it is issued — so this screen only ever opens a
 * draft, the route redirects an issued quote to its read-only view, and the
 * database refuses the write regardless.
 */

/** Long enough that a sentence being typed is one save, short enough to trust. */
const AUTOSAVE_MS = 1500;

export interface BuilderProps {
  quoteId: string | null;
  version: number;
  initial: DraftQuote;
  clients: Client[];
  snippets: Snippet[];
  priceBook: PriceBookRow[];
  initialPhotos: PhotoView[];
  marginFloorPct: number;
  gstRegistered: boolean;
}

export function Builder({
  quoteId: initialQuoteId,
  version,
  initial,
  clients,
  snippets,
  priceBook,
  initialPhotos,
  marginFloorPct,
  gstRegistered,
}: BuilderProps) {
  const router = useRouter();
  const toast = useToast();

  const [quoteId, setQuoteId] = useState(initialQuoteId);
  const [draft, setDraft] = useState<DraftQuote>(initial);
  const [photos, setPhotos] = useState<PhotoView[]>(initialPhotos);
  const [dirty, setDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(initialQuoteId !== null);
  const [saving, setSaving] = useState(false);
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(
    initial.items.some((i) => i.is_optional || i.tier),
  );
  const [previewTier, setPreviewTier] = useState<Tier | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({
    client: true,
    job: true,
    items: true,
    margin: true,
    clauses: true,
    photos: true,
  });

  // Collapsing on a phone happens after mount so the server and the first
  // client render agree; a hydration mismatch here would flash the whole form.
  useEffect(() => {
    if (!window.matchMedia("(max-width: 940px)").matches) return;
    const first = !initial.client_id ? "client" : !initial.roof_type.trim() ? "job" : "items";
    setOpen({ [first]: true });
  }, [initial.client_id, initial.roof_type]);

  const patch = useCallback((changes: Partial<DraftQuote>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setDirty(true);
  }, []);

  const setItems = useCallback((update: (current: DraftItem[]) => DraftItem[]) => {
    setDraft((current) => ({ ...current, items: update(current.items) }));
    setDirty(true);
  }, []);

  const client = clients.find((c) => c.id === draft.client_id) ?? null;
  const marginPct = Number.parseFloat(draft.margin_pct) || 0;
  const lowMargin = isBelowMarginFloor(marginPct, marginFloorPct);
  const described = describedItems(draft.items);
  const canSave = Boolean(draft.client_id) && described.length > 0;

  // ── Pricing. Every figure comes from lib/quote-pricing, never from here. ──
  const scope = useMemo(() => toScopeItems(draft.items), [draft.items]);
  const calcQuote = useMemo(() => toCalcQuote(draft), [draft]);
  const tiers = useMemo(() => offeredTiers(scope), [scope]);
  const tier = previewTier && tiers.includes(previewTier) ? previewTier : (tiers[0] ?? null);

  const totals = useMemo(
    () => priceSelection(calcQuote, scope, { tier, optionalIds: [] }),
    [calcQuote, scope, tier],
  );
  const extras = useMemo(
    () => optionalExtras(scope).filter((i) => i.tier === null || i.tier === tier),
    [scope, tier],
  );
  const extrasCents = useMemo(() => {
    if (extras.length === 0) return 0;
    const withAll = priceSelection(calcQuote, scope, {
      tier,
      optionalIds: extras.map((i) => i.id),
    });
    return withAll.display.total - totals.display.total;
  }, [calcQuote, scope, tier, extras, totals.display.total]);

  const tierTotals = useMemo(() => tierPrices(calcQuote, scope), [calcQuote, scope]);

  // ── Saving ────────────────────────────────────────────────────────────────
  //
  // Two races to keep out of a form that saves itself.
  //
  // The row id lives in a ref as well as in state, because a second save
  // starting from a stale closure would see `quoteId` as null and create a
  // SECOND draft. `inFlight` then serialises overlapping saves, so a manual
  // "Save draft" landing on top of a running autosave waits rather than
  // duplicating it.
  const quoteIdRef = useRef(initialQuoteId);
  const inFlight = useRef<Promise<string | null> | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const persist = useCallback(async (): Promise<string | null> => {
    if (!draft.client_id || describedItems(draft.items).length === 0) return quoteIdRef.current;
    if (inFlight.current) await inFlight.current;

    const snapshot = draft;
    const run = (async (): Promise<string | null> => {
      setSaving(true);
      const result = await saveDraft(toSavePayload(quoteIdRef.current, snapshot));
      setSaving(false);

      if (!result.ok) {
        toast(result.error, "warning");
        return null;
      }

      if (!quoteIdRef.current) {
        quoteIdRef.current = result.id;
        setQuoteId(result.id);
        // The draft now has a home. Swapping the URL in place rather than
        // navigating keeps the form mounted, so nothing loses focus mid-sentence
        // and a refresh still lands on the right quote.
        window.history.replaceState(null, "", `/quotes/${result.id}/edit`);
      }

      setSavedOnce(true);
      // Only clear the flag if nothing was typed while this save was running —
      // otherwise those keystrokes would sit unsaved with the rail claiming
      // everything was fine.
      if (draftRef.current === snapshot) setDirty(false);
      return result.id;
    })();

    inFlight.current = run;
    try {
      return await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, [draft, toast]);

  useEffect(() => {
    if (!dirty || !canSave || saving) return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, canSave, saving, persist]);

  const saveNow = async () => {
    const id = await persist();
    if (id) toast("Draft saved", "success", "check-circle");
  };

  const review = async () => {
    const id = await persist();
    if (id) router.push(`/quotes/${id}`);
  };

  const addFromPriceBook = (item: PriceBookRow): string => {
    const line: DraftItem = {
      key: nextKey(),
      kind: item.kind,
      description: item.description,
      qty: "1",
      unit: item.unit,
      unit_cost_cents: item.unit_cost_cents,
      is_optional: false,
      tier: null,
    };
    setItems((current) => [...current, line]);
    return line.key;
  };

  // A dirty-but-saveable draft reads as "saving" because it is about to be —
  // the debounce is an implementation detail the operator should not have to
  // hold in their head.
  const saveStatus: SaveStatus = saving
    ? "saving"
    : dirty
      ? canSave
        ? "saving"
        : "dirty"
      : savedOnce
        ? "saved"
        : "unsaved";

  const complete = {
    client: Boolean(draft.client_id),
    job: draft.roof_type.trim().length > 0,
    items: described.length > 0,
    margin: marginPct > 0,
    clauses: draft.inclusions.length + draft.exclusions.length > 0,
    photos: photos.length > 0,
  };

  const toggleSection = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <div className="stack-6 builder-page">
      <PageHeader
        crumbs={[
          { label: "Quotes", href: "/quotes" },
          { label: initialQuoteId ? "Edit draft" : "New quote" },
        ]}
        title={
          initialQuoteId
            ? version > 1
              ? `Edit revision v${version}`
              : "Edit draft"
            : "New quote"
        }
        description={
          initialQuoteId
            ? "Editing a draft. Totals recompute live and changes save themselves."
            : "Build a quote from your site visit — totals update as you type, and drafts autosave."
        }
      />

      <div className="builder">
        <div className="builder__form">
          <ClientSection
            draft={draft}
            clients={clients}
            client={client}
            onPatch={patch}
            onNewClient={() => setClientModalOpen(true)}
            shell={{ open: !!open.client, onToggle: toggleSection, complete: complete.client }}
          />

          <JobSection
            draft={draft}
            onPatch={patch}
            shell={{ open: !!open.job, onToggle: toggleSection, complete: complete.job }}
          />

          <Section
            id="items"
            num="3"
            title="Line items"
            small="Drag to reorder (or use the arrows). Totals update live."
            complete={complete.items}
            open={!!open.items}
            onToggle={toggleSection}
            right={
              <div style={{ display: "inline-flex", gap: 6 }}>
                <Button
                  variant={showOptions ? "subtle" : "ghost"}
                  size="sm"
                  icon="layers"
                  onClick={() => setShowOptions((v) => !v)}
                  title="Mark lines as client-selectable extras, or group them into good/better/best options"
                >
                  Options
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon="book-open"
                  onClick={() => setPickerOpen(true)}
                >
                  Price book
                </Button>
              </div>
            }
          >
            <AreaCalc
              priceBook={priceBook}
              onAddLines={(lines) => setItems((current) => [...current, ...lines])}
            />
            <LineItemGroup
              kind="material"
              items={draft.items}
              onChange={setItems}
              showOptions={showOptions}
            />
            <LineItemGroup
              kind="labour"
              items={draft.items}
              onChange={setItems}
              showOptions={showOptions}
            />
          </Section>

          <MarginSection
            draft={draft}
            onPatch={patch}
            marginCents={totals.margin}
            lowMargin={lowMargin}
            marginFloorPct={marginFloorPct}
            gstRegistered={gstRegistered}
            shell={{ open: !!open.margin, onToggle: toggleSection, complete: complete.margin }}
          />

          <Section
            id="clauses"
            num="5"
            title="Inclusions & exclusions"
            small="Ticked clauses are copied onto this quote. Later edits to the library won't change it."
            complete={complete.clauses}
            open={!!open.clauses}
            onToggle={toggleSection}
          >
            <div className="grid-2" style={{ alignItems: "start", gap: 24 }}>
              <ClauseSection
                kind="inclusion"
                snippets={snippets}
                selected={draft.inclusions}
                onChange={(next) => patch({ inclusions: next })}
              />
              <ClauseSection
                kind="exclusion"
                snippets={snippets}
                selected={draft.exclusions}
                onChange={(next) => patch({ exclusions: next })}
              />
            </div>
          </Section>

          <Section
            id="photos"
            num="6"
            title="Site photos"
            small="From your visit. Optionally print them on the quote with captions."
            complete={complete.photos}
            optional
            open={!!open.photos}
            onToggle={toggleSection}
          >
            <PhotosSection
              quoteId={quoteId}
              photos={photos}
              onPhotosChange={setPhotos}
              include={draft.include_photos}
              onToggleInclude={(on) => patch({ include_photos: on })}
              ensureSaved={persist}
            />
          </Section>
        </div>

        <SummaryRail
          totals={totals}
          marginPct={marginPct}
          gstEnabled={draft.gst_enabled}
          gstRate={draft.gst_rate}
          extrasCents={extrasCents}
          extrasCount={extras.length}
          tiers={tiers}
          previewTier={tier}
          tierTotals={tierTotals}
          onPreviewTier={setPreviewTier}
          saveStatus={saveStatus}
          canSave={canSave}
          clientEmail={client?.email ?? null}
          onSave={() => void saveNow()}
          onReview={() => void review()}
        />
      </div>

      <div className="mbar">
        <div className="mbar__total">
          <span className="mbar__lbl">Total{draft.gst_enabled ? " inc GST" : ""}</span>
          <span className="mbar__val mono">{moneyShort(totals.display.total)}</span>
          {lowMargin && (
            <span className="mbar__warn" title={`Margin below your ${marginFloorPct}% floor`}>
              <Icon name="alert-triangle" size={13} />
              {marginPct}%
            </span>
          )}
        </div>
        <SaveStateBadge status={saveStatus} compact className="mbar__state" />
        <Button variant="brand" icon="save" disabled={!canSave} onClick={() => void saveNow()}>
          Save
        </Button>
      </div>

      {clientModalOpen && (
        <NewClientModal
          onClose={() => setClientModalOpen(false)}
          onCreated={(created) => {
            setClientModalOpen(false);
            patch({ client_id: created.id });
            router.refresh();
            toast(`${created.name} added`, "success", "user-plus");
          }}
        />
      )}

      {pickerOpen && (
        <PriceBookPicker
          priceBook={priceBook}
          lineItems={draft.items}
          onAdd={addFromPriceBook}
          onSetQty={(key, qty) =>
            setItems((current) =>
              current.map((i) => (i.key === key ? { ...i, qty: String(qty) } : i)),
            )
          }
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
