// The `.ts` specifier is deliberate: this module is covered by tests/xero.test.ts
// under node's native type stripping, which resolves import specifiers literally.
// `allowImportingTsExtensions` in tsconfig.json exists for exactly this.
import { computeDisplayTotals, displayUnitCents } from "./money.ts";
import type { Client, Invoice, InvoiceKind, ItemKind, Quote, Settings } from "./db/types";

/**
 * Xero **export**, not a Xero integration.
 *
 * The build plan's second open question is whether John invoices at all or only
 * quotes. If Xero keeps doing his invoicing, this whole area collapses to a
 * handoff — so the handoff is what gets built properly. An OAuth integration
 * would be weeks of token refresh, tenant selection and webhook reconciliation
 * spent on a decision that has not been made yet, and it would have to be ripped
 * out if the answer comes back "Xero does it".
 *
 * Two shapes are produced from the same source data: the JSON body Xero's
 * `PUT /Invoices` accepts, and the CSV its invoice importer accepts for the
 * no-API path. They are derived from one another so they cannot drift.
 */

/** Xero's default revenue account in a fresh AU chart of accounts. */
export const XERO_SALES_ACCOUNT_CODE = "200";

/** AU tax types: GST on income, and the no-GST case for an unregistered business. */
const TAX_TYPE_GST = "OUTPUT";
const TAX_TYPE_NONE = "NONE";

/**
 * Dates on an invoice are the business's dates, not UTC's. A quote issued at
 * 9pm in Sydney is dated that day, not the next one — a shifted invoice date
 * lands the revenue in the wrong BAS quarter four times a year.
 */
const BUSINESS_TIMEZONE = "Australia/Sydney";

const KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Deposit",
  progress: "Progress claim",
  final: "Final invoice",
};

export type XeroLineAmountTypes = "Exclusive" | "NoTax";

export interface XeroLineItem {
  Description: string;
  Quantity: number;
  /** DOLLARS — see `toDollars`, the single place cents stop being cents. */
  UnitAmount: number;
  AccountCode: string;
  TaxType: string;
}

export interface XeroInvoicePayload {
  Type: "ACCREC";
  Status: "AUTHORISED";
  InvoiceNumber?: string;
  Reference?: string;
  Contact: { Name: string; EmailAddress?: string };
  Date: string;
  DueDate?: string;
  CurrencyCode: "AUD";
  LineAmountTypes: XeroLineAmountTypes;
  LineItems: XeroLineItem[];
}

/** A quote line as the exporter needs it. Structurally a `QuoteItem`. */
export interface XeroSourceItem {
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  /** Supplier COST. Marked up before it ever reaches Xero. */
  unit_cost_cents: number;
  is_optional?: boolean;
}

export interface XeroExportOptions {
  /** Revenue account in Xero's chart of accounts. */
  accountCode?: string;
  /** Overrides the derived reference, which is the quote number. */
  reference?: string | null;
}

/**
 * **The cents-to-dollars boundary.** Money is integer cents everywhere else in
 * this codebase; Xero's API takes decimal dollars. The conversion happens here,
 * once, and nowhere else. Applying it twice yields $12.35 on a $1,234.56
 * invoice; forgetting it yields $123,456 — and Xero accepts both without
 * complaint, which is why this is a comment and not a hope.
 */
function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}

// en-CA is ISO-ordered, which is what Xero parses unambiguously.
const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Xero wants a plain date. Postgres `date` columns already are one. */
function toXeroDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return DATE_FORMAT.format(parsed);
}

/** A malformed quantity contributes nothing rather than poisoning the payload. */
function quantity(value: number | string): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

type ExportInvoice = Pick<
  Invoice,
  "invoice_number" | "kind" | "total_cents" | "due_at" | "created_at" | "sent_at"
>;

type ExportQuote = Pick<
  Quote,
  "quote_number" | "roof_type" | "margin_pct" | "gst_enabled" | "gst_rate"
>;

type ExportSettings = Pick<Settings, "gst_registered" | "gst_rate">;

/**
 * Build the ACCREC body for one invoice.
 *
 * `items` is the **accepted scope** — resolve tiers and optional extras before
 * calling, because Xero must receive what the client agreed to buy, not every
 * line the quote could have contained.
 *
 * Every amount that leaves here is a SELL price. Line items store supplier cost;
 * an accounts-receivable document showing cost would hand the homeowner the
 * margin on the invoice they are paying.
 */
export function toXeroInvoicePayload(
  invoice: ExportInvoice,
  client: Pick<Client, "name" | "email"> | null,
  quote: ExportQuote | null,
  items: readonly XeroSourceItem[],
  settings: ExportSettings | null,
  options: XeroExportOptions = {},
): XeroInvoicePayload {
  // Registration is the master switch. With a quote, its own toggle decides;
  // an invoice raised straight against a job has no toggle to consult, so
  // registration alone settles it.
  const registered = Boolean(settings?.gst_registered);
  const gstOn = registered && (quote ? quote.gst_enabled : true);
  const rate = Number(quote?.gst_rate ?? settings?.gst_rate ?? 10);
  const gstRate = Number.isFinite(rate) ? rate : 10;

  const accountCode = options.accountCode ?? XERO_SALES_ACCOUNT_CODE;
  const taxType = gstOn ? TAX_TYPE_GST : TAX_TYPE_NONE;
  const marginPct = quote?.margin_pct ?? 0;

  // Itemise only when this invoice bills the whole quote. A deposit or a
  // progress claim is a fraction of the job, and shipping the full line set
  // against a fractional total would give Xero a document that does not add up.
  const priced = computeDisplayTotals(
    { margin_pct: marginPct, gst_enabled: gstOn, gst_rate: gstRate, show_breakdown: true },
    [...items],
  );
  const itemise = items.length > 0 && priced.total === invoice.total_cents;

  const lineItems: XeroLineItem[] = itemise
    ? items.map((item) => ({
        Description: item.description,
        Quantity: quantity(item.qty),
        UnitAmount: toDollars(displayUnitCents(item, marginPct)),
        AccountCode: accountCode,
        TaxType: taxType,
      }))
    : [
        {
          Description: claimDescription(invoice, quote),
          Quantity: 1,
          // Line amounts are exclusive of tax, but the invoice total is what the
          // client pays. Back the GST out so Xero adds it once, not twice.
          UnitAmount: toDollars(
            gstOn
              ? Math.round((invoice.total_cents * 100) / (100 + gstRate))
              : invoice.total_cents,
          ),
          AccountCode: accountCode,
          TaxType: taxType,
        },
      ];

  return {
    Type: "ACCREC",
    Status: "AUTHORISED",
    InvoiceNumber: invoice.invoice_number ?? undefined,
    Reference: options.reference ?? quote?.quote_number ?? undefined,
    Contact: {
      Name: client?.name?.trim() || "Unknown client",
      EmailAddress: client?.email ?? undefined,
    },
    Date: toXeroDate(invoice.sent_at ?? invoice.created_at) ?? DATE_FORMAT.format(new Date()),
    DueDate: toXeroDate(invoice.due_at),
    CurrencyCode: "AUD",
    LineAmountTypes: gstOn ? "Exclusive" : "NoTax",
    LineItems: lineItems,
  };
}

function claimDescription(invoice: ExportInvoice, quote: ExportQuote | null): string {
  const works = quote?.roof_type?.trim() || "Roofing works";
  const reference = quote?.quote_number ? ` — quote ${quote.quote_number}` : "";
  return `${KIND_LABEL[invoice.kind]}: ${works}${reference}`;
}

// ── CSV (the no-API path) ───────────────────────────────────────────────────

/**
 * Xero's sales-invoice import columns, in its own order and spelling. The
 * leading asterisks are part of the header text Xero expects, not a convention
 * of ours — renaming them silently breaks the import.
 */
export const XERO_CSV_HEADERS = [
  "*ContactName", "EmailAddress",
  "POAddressLine1", "POAddressLine2", "POAddressLine3", "POAddressLine4",
  "POCity", "PORegion", "POPostalCode", "POCountry",
  "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate",
  "InventoryItemCode", "*Description", "*Quantity", "*UnitAmount", "Discount",
  "*AccountCode", "*TaxType",
  "TrackingName1", "TrackingOption1", "TrackingName2", "TrackingOption2",
  "Currency", "BrandingTheme",
] as const;

export interface XeroCsvRow {
  ContactName: string;
  EmailAddress?: string | null;
  InvoiceNumber?: string | null;
  Reference?: string | null;
  InvoiceDate: string;
  DueDate: string;
  Description: string;
  Quantity: number;
  /** DOLLARS, already through `toDollars`. */
  UnitAmount: number;
  AccountCode: string;
  TaxType: string;
  Currency?: string;
}

/** One CSV row per line item — Xero groups them back by invoice number. */
export function xeroCsvRows(payload: XeroInvoicePayload): XeroCsvRow[] {
  return payload.LineItems.map((line) => ({
    ContactName: payload.Contact.Name,
    EmailAddress: payload.Contact.EmailAddress ?? null,
    InvoiceNumber: payload.InvoiceNumber ?? null,
    Reference: payload.Reference ?? null,
    InvoiceDate: payload.Date,
    // Xero's importer requires a due date. Falling back to the invoice date
    // means "due on receipt", which is what an unset due date meant anyway.
    DueDate: payload.DueDate ?? payload.Date,
    Description: line.Description,
    Quantity: line.Quantity,
    UnitAmount: line.UnitAmount,
    AccountCode: line.AccountCode,
    TaxType: line.TaxType,
    Currency: payload.CurrencyCode,
  }));
}

function cell(header: (typeof XERO_CSV_HEADERS)[number], row: XeroCsvRow): string {
  switch (header) {
    case "*ContactName": return row.ContactName;
    case "EmailAddress": return row.EmailAddress ?? "";
    case "*InvoiceNumber": return row.InvoiceNumber ?? "";
    case "Reference": return row.Reference ?? "";
    case "*InvoiceDate": return row.InvoiceDate;
    case "*DueDate": return row.DueDate;
    case "*Description": return row.Description;
    case "*Quantity": return String(row.Quantity);
    // Already dollars. Stringified rather than re-formatted so the conversion
    // stays at exactly one place in this file.
    case "*UnitAmount": return String(row.UnitAmount);
    case "*AccountCode": return row.AccountCode;
    case "*TaxType": return row.TaxType;
    case "Currency": return row.Currency ?? "AUD";
    default: return "";
  }
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CRLF and a trailing newline: what Xero's importer and Excel both expect. */
export function toXeroCsv(rows: readonly XeroCsvRow[]): string {
  const lines = [
    XERO_CSV_HEADERS.join(","),
    ...rows.map((row) => XERO_CSV_HEADERS.map((h) => escapeCsv(cell(h, row))).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
