import "server-only";
import { displayAmountCents, displayUnitCents } from "@/lib/money";
import { offeredTiers, optionalExtras, priceSelection } from "@/lib/quote-pricing";
import { isAcceptable, quoteFlags, validUntil } from "@/lib/quote-state";
import { tableKey, type PortalLine, type PortalPricing, type PortalTotals } from "./pricing";
import type { QuoteDetail } from "@/lib/db/quotes";
import type { Settings, Tier } from "@/lib/db/types";

/**
 * The homeowner's view of a quote.
 *
 * Every field below is built explicitly rather than by spreading the database
 * row, and that is the whole point of this file. A `quotes` row carries
 * `margin_pct`, and `quote_items` carry `unit_cost_cents` — supplier cost. Hand
 * either to a client component and it is serialised into the page the customer
 * is reading. So the row stops here: what crosses the boundary is marked-up
 * money and nothing else.
 */

export interface PortalView {
  token: string;
  quoteNumber: string;
  status: string;
  roofType: string;
  notes: string | null;
  validDays: number;
  issuedLabel: string;
  validUntilLabel: string;
  daysLeft: number;
  expired: boolean;
  /** True only when the database would also accept it. Never a styling choice. */
  acceptable: boolean;
  acceptedAtLabel: string | null;
  declinedAtLabel: string | null;
  signedName: string | null;
  acceptedTotalCents: number | null;
  settledTier: Tier | null;
  settledExtraIds: string[];
  client: {
    name: string;
    phone: string | null;
    email: string | null;
    propertyAddress: string | null;
  };
  business: {
    name: string;
    legalName: string | null;
    licenceNo: string | null;
    abn: string | null;
    acn: string | null;
    phone: string | null;
    email: string | null;
    site: string | null;
    address: string | null;
  };
  inclusions: string[];
  exclusions: string[];
  paymentTerms: string | null;
  pricing: PortalPricing;
  pdfUrl: string | null;
}

/**
 * Sydney time, spelled out. The server runs in UTC, so a quote issued at 9am on
 * the 3rd would otherwise print as the 2nd for the client reading it.
 */
const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Australia/Sydney",
};

export function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", DATE_FORMAT);
}

/**
 * Above this many tier × extras combinations the precomputed table stops being
 * worth its payload. A real roofing quote offers three tiers and a handful of
 * extras, so the cap is a guard against absurd input rather than a real limit.
 */
const MAX_COMBINATIONS = 4096;

export function buildView(
  detail: QuoteDetail,
  settings: Settings | null,
  pdfUrl: string | null,
  now: Date = new Date(),
): PortalView {
  const { quote, client, items, clauses, selections } = detail;

  const tiers = offeredTiers(items);
  const extras = optionalExtras(items);
  const flags = quoteFlags(quote, settings ?? {}, now);

  const lines: PortalLine[] = items.map((item) => ({
    id: item.id,
    kind: item.kind,
    description: item.description,
    qty: Number(item.qty),
    unit: item.unit,
    unitCents: displayUnitCents(item, quote.margin_pct),
    amountCents: displayAmountCents(item, quote.margin_pct),
    isOptional: item.is_optional,
    tier: item.tier,
  }));

  const tierKeys: (Tier | null)[] = tiers.length > 0 ? tiers : [null];
  const combinations = tierKeys.length * 2 ** extras.length;

  let table: Record<string, PortalTotals> | null = null;
  if (combinations <= MAX_COMBINATIONS) {
    table = {};
    for (const tier of tierKeys) {
      for (let mask = 0; mask < 2 ** extras.length; mask += 1) {
        const optionalIds = extras.filter((_, i) => (mask & (1 << i)) !== 0).map((e) => e.id);
        const { display } = priceSelection(quote, items, { tier, optionalIds });
        table[tableKey(tier, mask)] = display;
      }
    }
  }

  return {
    token: quote.portal_token ?? "",
    quoteNumber: quote.quote_number ?? "Quote",
    status: quote.status,
    roofType: quote.roof_type || "Roofing works",
    notes: quote.notes,
    validDays: quote.valid_days,
    issuedLabel: formatDate(quote.sent_at ?? quote.created_at) ?? "",
    validUntilLabel: formatDate(validUntil(quote)) ?? "",
    daysLeft: flags.daysLeft,
    expired: flags.expired,
    acceptable: isAcceptable(quote, now),
    acceptedAtLabel: formatDate(quote.accepted_at),
    declinedAtLabel: formatDate(quote.declined_at),
    signedName: quote.signed_name,
    acceptedTotalCents: quote.accepted_total_cents,
    settledTier: quote.selected_tier,
    settledExtraIds: selections.map((s) => s.quote_item_id),
    client: {
      name: client.name,
      phone: client.phone,
      email: client.email,
      propertyAddress: client.property_address,
    },
    business: {
      name: settings?.business_name ?? "Australian Roofing Contractors",
      legalName: settings?.legal_name ?? null,
      licenceNo: settings?.licence_no ?? null,
      abn: settings?.abn ?? null,
      acn: settings?.acn ?? null,
      phone: settings?.phone ?? null,
      email: settings?.email ?? null,
      site: settings?.site ?? null,
      address: settings?.address ?? null,
    },
    inclusions: clauses.filter((c) => c.kind === "inclusion").map((c) => c.text),
    exclusions: clauses.filter((c) => c.kind === "exclusion").map((c) => c.text),
    paymentTerms: settings?.payment_terms ?? null,
    pricing: {
      showBreakdown: quote.show_breakdown,
      gstEnabled: quote.gst_enabled,
      gstRate: Number(quote.gst_rate),
      depositPct: settings?.deposit_enabled ? Number(settings.deposit_pct) : 0,
      lines,
      tiers,
      extraIds: extras.map((e) => e.id),
      table,
    },
    pdfUrl,
  };
}
