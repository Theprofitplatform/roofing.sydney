/**
 * The client-facing quote PDF.
 *
 * Two constraints shape this file:
 *
 * 1. COST NEVER LEAVES THE BUILDING. Every price here is `displayUnitCents` /
 *    `displayAmountCents` — cost marked up by `margin_pct`. `computeTotals` is
 *    deliberately not imported: its `margin` and `subtotal` fields are
 *    internal, and a stray reference to either is the one defect that costs the
 *    owner a job. `priceSelection` returns those internal figures alongside the
 *    client-facing ones, so its result is destructured to `display` on the spot
 *    and the internal fields are never bound to a name this file can print.
 *
 * 1a. A QUOTE IS NOT ITS LINE ITEMS. `quote_items` holds the base scope, the
 *    good/better/best variants and the client-selectable extras all in one
 *    table. Printing the table raw prices every tier at once and bills the
 *    extras as compulsory. `resolveScope` decides what this document is priced
 *    for; it is the same function the portal and the accept path use, so the
 *    paper and the screen can never disagree.
 *
 * 2. It is an ARTEFACT, not a view. The issued PDF is written to storage once
 *    and served forever after, so it must render from its props alone — no
 *    fonts fetched, no images fetched, no clock read. Only the built-in
 *    Helvetica family is used, so the node:22-alpine container needs no font
 *    files and the same input renders the same page content every time.
 *    Note the buffers are still not byte-equal: pdfkit writes a random `/ID`
 *    into the trailer, so dedupe on the quote row, never on a hash of the file.
 *
 * Layout is ported from design-reference/quoting-tool/app/pdf.jsx; the rules
 * themselves live in ./quote-styles.ts. React-PDF supports a flexbox subset
 * only: no grid, no float, no gap — two-column blocks are rows of flexed
 * children with a margin between them.
 */

import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { Document, Image, Page, Path, Svg, Text, View } from "@react-pdf/renderer";

import type { Client, Quote, QuoteClause, QuoteItem, Settings, Tier } from "../db/types.ts";
import { depositCents, displayAmountCents, displayUnitCents, money } from "../money.ts";
import {
  defaultSelection,
  extraDelta,
  offeredTiers,
  priceSelection,
  resolveScope,
  type Selection,
} from "../quote-pricing.ts";
import { BRAND, FAINT, ON_BRAND, pt, s } from "./quote-styles.ts";

export interface QuotePdfInput {
  quote: Quote;
  client: Client;
  settings: Settings;
  items: QuoteItem[];
  clauses: QuoteClause[];
  photos?: { dataUrl: string; caption: string | null }[];
  /**
   * What this copy of the document is priced for. Omitted on issue, where the
   * quote has not been chosen yet and the cheapest offered tier is the honest
   * default — starting on the dearest reads as a sales trick. Once accepted,
   * the caller passes the tier and extras the client actually signed for so the
   * stored PDF reproduces their decision.
   */
  selection?: Selection;
}

const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };


const DAY_MS = 86_400_000;

const joinDot = (parts: (string | null | undefined | false)[]): string =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");

/** en-AU throughout — "6 August 2026", never the ambiguous 6/8/2026. */
const formatDate = (d: Date): string =>
  d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** A quote carrying a malformed timestamp must fail, not print "Invalid Date". */
const toDate = (value: string, field: string): Date => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`quote.${field} is not a valid date: ${value}`);
  return d;
};

/** Quantities print as typed — Number() drops a trailing ".0" beside a 1.5. */
const qtyText = (qty: number): string => String(Number(qty));

/** The lockup mark, redrawn from the prototype's RoofMark SVG. */
function RoofMark(): React.ReactElement {
  const stroke = { stroke: ON_BRAND, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={pt(26)} height={pt(26)} viewBox="0 0 24 24">
      <Path d="M3 11.5 12 4l9 7.5" {...stroke} />
      <Path d="M5 10.2V20h14v-9.8" {...stroke} />
      <Path d="M9.5 20v-5.5h5V20" {...stroke} />
    </Svg>
  );
}

/** Stands in for the prototype's lucide check / minus glyphs. */
function ClauseBullet({ included }: { included: boolean }): React.ReactElement {
  return (
    <Svg width={pt(12)} height={pt(12)} viewBox="0 0 12 12">
      <Path
        d={included ? "M2 6.4 4.7 9 10 3" : "M2 6h8"}
        stroke={included ? BRAND : FAINT}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ItemTable({
  caption,
  rows,
  marginPct,
}: {
  caption: string;
  rows: QuoteItem[];
  marginPct: number;
}): React.ReactElement {
  return (
    <View>
      <Text style={s.caption}>{caption}</Text>
      <View style={s.th}>
        <Text style={[s.thText, s.cDesc]}>Description</Text>
        <Text style={[s.thText, s.cQty]}>Qty</Text>
        <Text style={[s.thText, s.cUnit]}>Unit</Text>
        <Text style={[s.thText, s.cPrice]}>Unit price</Text>
        <Text style={[s.thText, s.cAmount]}>Amount</Text>
      </View>
      {rows.map((it) => (
        <View style={s.tr} key={it.id} wrap={false}>
          <Text style={[s.td, s.cDesc, s.descText]}>{it.description}</Text>
          <Text style={[s.td, s.cQty]}>{qtyText(it.qty)}</Text>
          <Text style={[s.td, s.cUnit]}>{it.unit}</Text>
          <Text style={[s.td, s.cPrice]}>{money(displayUnitCents(it, marginPct))}</Text>
          <Text style={[s.td, s.cAmount]}>{money(displayAmountCents(it, marginPct))}</Text>
        </View>
      ))}
    </View>
  );
}

export function QuoteDocument({
  quote,
  client,
  settings,
  items,
  clauses,
  photos = [],
  selection,
}: QuotePdfInput): React.ReactElement<DocumentProps> {
  const modern = quote.pdf_layout === "modern";

  // An accepted quote records the tier on the row itself, so a re-render of a
  // signed document reproduces it even when the caller passes nothing. Coerced
  // through `??` because a hand-built or partially-selected row may carry
  // undefined, and treating that as "a tier was chosen" silently prices the
  // base scope alone — the failure mode this whole block exists to prevent.
  const accepted = quote.selected_tier ?? null;
  const chosen: Selection =
    selection ??
    (accepted !== null ? { tier: accepted, optionalIds: [] } : defaultSelection(items));

  // resolveScope owns the rule; matching on id keeps the richer QuoteItem row
  // (description, unit) rather than the narrower ScopeItem it hands back.
  const inScope = new Set(resolveScope(items, chosen).map((i) => i.id));
  const priced = items.filter((i) => inScope.has(i.id));

  const tiers = offeredTiers(items);
  const tierLabel = tiers.length > 0 && chosen.tier ? TIER_LABEL[chosen.tier] : null;

  /**
   * Extras the client can still add. An optional line carrying a tier belongs
   * to that tier, so one attached to an option they did not take is not on
   * offer here and must not be advertised at a price they cannot buy.
   */
  const extras = items.filter(
    (i) => i.is_optional && !inScope.has(i.id) && (i.tier === null || i.tier === chosen.tier),
  );

  const materials = priced.filter((i) => i.kind === "material");
  const labour = priced.filter((i) => i.kind === "labour");
  const inclusions = clauses.filter((c) => c.kind === "inclusion");
  const exclusions = clauses.filter((c) => c.kind === "exclusion");

  const { display: totals } = priceSelection(quote, items, chosen);
  const depositDue = settings.deposit_enabled ? depositCents(totals.total, settings.deposit_pct) : 0;

  // A draft has no number yet; the document still has to say what it is.
  const number = quote.quote_number ?? "DRAFT";
  const issued = toDate(quote.sent_at ?? quote.created_at, quote.sent_at ? "sent_at" : "created_at");
  const validUntil = new Date(issued.getTime() + quote.valid_days * DAY_MS);

  const jobTitle = quote.roof_type ?? "Roofing works";
  // The prototype strips the trading name out of the legal name so the tagline
  // reads "Pty Ltd · 14 Foundry Rd" rather than repeating the business name.
  const orgTag = joinDot([
    settings.legal_name && settings.business_name
      ? settings.legal_name.replace(settings.business_name, "").trim()
      : settings.legal_name,
    settings.address,
  ]);

  const orgLines = (onBrand: boolean) => (
    <View style={onBrand ? [s.org, s.onBrand] : s.org}>
      {settings.licence_no ? (
        <Text style={onBrand ? [s.orgLic, s.onBrand] : s.orgLic}>Licence {settings.licence_no}</Text>
      ) : null}
      <Text>{joinDot([settings.abn && `ABN ${settings.abn}`, settings.acn && `ACN ${settings.acn}`])}</Text>
      {settings.phone ? <Text>{settings.phone}</Text> : null}
      {settings.email ? <Text>{settings.email}</Text> : null}
    </View>
  );

  const lockup = (onBrand: boolean) => (
    <View style={s.logo}>
      <View style={onBrand ? [s.logoMark, s.logoMarkGhost] : s.logoMark}>
        <RoofMark />
      </View>
      <View>
        <Text style={onBrand ? [s.logoName, s.onBrand] : s.logoName}>{settings.business_name}</Text>
        {orgTag ? <Text style={onBrand ? [s.logoTag, s.onBrand] : s.logoTag}>{orgTag}</Text> : null}
      </View>
    </View>
  );

  return (
    <Document title={`Quotation ${number}`} author={settings.business_name ?? undefined}>
      <Page size="A4" style={s.page}>
        {modern ? (
          <View style={s.band}>
            {lockup(true)}
            {orgLines(true)}
          </View>
        ) : (
          <View style={s.head}>
            {lockup(false)}
            {orgLines(false)}
          </View>
        )}

        <View style={modern ? [s.titleRow, s.titleRowModern] : s.titleRow}>
          <Text style={s.title}>Quotation</Text>
          <View style={s.meta}>
            <Text style={s.metaNumber}>{number}</Text>
            <Text>Issued {formatDate(issued)}</Text>
            <Text>
              Valid for {quote.valid_days} days — until {formatDate(validUntil)}
            </Text>
          </View>
        </View>

        <View style={s.parties}>
          <View style={[s.col, s.colGap]}>
            <Text style={s.label}>Prepared for</Text>
            <Text style={s.partyName}>{client.name}</Text>
            {client.phone ? <Text style={s.partyLine}>{client.phone}</Text> : null}
            {client.email ? <Text style={s.partyLine}>{client.email}</Text> : null}
          </View>
          <View style={s.col}>
            <Text style={s.label}>Property</Text>
            <Text style={s.partyName}>{client.property_address}</Text>
          </View>
        </View>

        <View style={s.job}>
          <Text style={s.jobLabel}>Job</Text>
          <Text style={s.jobValue}>{jobTitle}</Text>
          {/* Which of the offered options this paper prices. Without it a
              tiered quote is three different prices wearing one number. */}
          {tierLabel ? <Text style={s.jobOption}>Option — {tierLabel}</Text> : null}
          {quote.notes ? <Text style={s.jobNote}>{quote.notes}</Text> : null}
        </View>

        {quote.show_breakdown ? (
          <View>
            {materials.length > 0 ? (
              <ItemTable caption="Materials" rows={materials} marginPct={quote.margin_pct} />
            ) : null}
            {labour.length > 0 ? (
              <ItemTable caption="Labour" rows={labour} marginPct={quote.margin_pct} />
            ) : null}
          </View>
        ) : (
          <View style={s.single}>
            <Text style={s.singleDesc}>
              Supply and install — {jobTitle.toLowerCase()} as described above
            </Text>
            <Text style={s.singleAmount}>{money(totals.subtotal)}</Text>
          </View>
        )}

        <View style={s.totals}>
          <View style={s.totalsInner}>
            {quote.gst_enabled ? (
              <View>
                <View style={s.totalRow}>
                  <Text>Subtotal (ex GST)</Text>
                  <Text style={s.totalValue}>{money(totals.subtotal)}</Text>
                </View>
                <View style={s.totalRow}>
                  <Text>GST {quote.gst_rate}%</Text>
                  <Text style={s.totalValue}>{money(totals.gst)}</Text>
                </View>
              </View>
            ) : null}
            <View style={s.grand}>
              <Text style={s.grandLabel}>{quote.gst_enabled ? "Total inc GST" : "Total"}</Text>
              <Text style={s.grandValue}>{money(totals.total)}</Text>
            </View>
            {settings.deposit_enabled ? (
              <View style={[s.totalRow, s.deposit]}>
                <Text>Deposit due on acceptance ({settings.deposit_pct}%)</Text>
                <Text style={s.totalValue}>{money(depositDue)}</Text>
              </View>
            ) : null}
            {!quote.gst_enabled ? (
              <Text style={s.gstNote}>No GST — supplier is not registered for GST.</Text>
            ) : null}
          </View>
        </View>

        {extras.length > 0 ? (
          <View>
            <Text style={s.caption}>Optional extras</Text>
            <View style={s.th}>
              <Text style={[s.thText, s.cDesc]}>Description</Text>
              <Text style={[s.thText, s.cQty]}>Qty</Text>
              <Text style={[s.thText, s.cUnit]}>Unit</Text>
              <Text style={[s.thText, s.cPrice]}>Unit price</Text>
              <Text style={[s.thText, s.cAmount]}>Adds</Text>
            </View>
            {extras.map((it) => (
              <View style={s.tr} key={it.id} wrap={false}>
                <Text style={[s.td, s.cDesc, s.descText]}>{it.description}</Text>
                <Text style={[s.td, s.cQty]}>{qtyText(it.qty)}</Text>
                <Text style={[s.td, s.cUnit]}>{it.unit}</Text>
                <Text style={[s.td, s.cPrice]}>{money(displayUnitCents(it, quote.margin_pct))}</Text>
                {/* The change in the total, not the line's own amount — with the
                    breakdown shown the subtotal is a sum of rounded lines, so
                    this is the only figure the client can verify by subtraction. */}
                <Text style={[s.td, s.cAmount]}>
                  {money(extraDelta(quote, items, chosen, it.id))}
                </Text>
              </View>
            ))}
            <Text style={s.extrasNote}>
              Not included in the total above. Let us know which extras you want before accepting
              and we will re-issue the quote with them priced in.
            </Text>
          </View>
        ) : null}

        <View style={s.clauses}>
          <View style={[s.col, s.colGap]}>
            <Text style={s.clauseHead}>Inclusions</Text>
            {inclusions.map((c) => (
              <View style={s.clauseRow} key={c.id}>
                <View style={s.clauseIcon}>
                  <ClauseBullet included />
                </View>
                <Text style={[s.clauseText, s.clauseTextInc]}>{c.text}</Text>
              </View>
            ))}
          </View>
          <View style={s.col}>
            <Text style={s.clauseHead}>Exclusions</Text>
            {exclusions.map((c) => (
              <View style={s.clauseRow} key={c.id}>
                <View style={s.clauseIcon}>
                  <ClauseBullet included={false} />
                </View>
                <Text style={s.clauseText}>{c.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {quote.include_photos && photos.length > 0 ? (
          <View style={s.photos}>
            <Text style={s.clauseHead}>Site photos</Text>
            <View style={s.photoGrid}>
              {photos.map((p, i) => (
                <View style={s.photoCell} key={i} wrap={false}>
                  {/* Not an HTML <img>: react-pdf draws into the page and has
                      no alt attribute. The caption below carries the text. */}
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <Image style={s.photo} src={p.dataUrl} />
                  {p.caption ? <Text style={s.photoCap}>{p.caption}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={s.foot}>
          {/* Owner-supplied. Printed verbatim — never generated or paraphrased. */}
          {settings.payment_terms ? (
            <Text style={s.terms}>
              <Text style={s.termsLead}>Payment terms.</Text> {settings.payment_terms}
            </Text>
          ) : null}
          <Text style={s.acceptStmt}>
            Acceptance — I/we accept quote {number} as described above, including the inclusions,
            exclusions and payment terms.
          </Text>
          <View style={s.accept}>
            <View style={s.acceptName}>
              <View style={s.acceptLine} />
              <Text style={s.acceptLabel}>Accepted by (print name)</Text>
            </View>
            <View style={s.acceptSig}>
              <View style={s.acceptLine} />
              <Text style={s.acceptLabel}>Signature</Text>
            </View>
            <View style={s.acceptDate}>
              <View style={s.acceptLine} />
              <Text style={s.acceptLabel}>Date</Text>
            </View>
          </View>
          <Text style={s.legal}>
            {joinDot([
              settings.legal_name,
              settings.licence_no && `Licence ${settings.licence_no}`,
              settings.abn && `ABN ${settings.abn}`,
              settings.email,
              settings.site,
            ])}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
