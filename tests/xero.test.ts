import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toXeroInvoicePayload,
  toXeroCsv,
  xeroCsvRows,
  XERO_CSV_HEADERS,
  XERO_SALES_ACCOUNT_CODE,
  type XeroSourceItem,
} from "../src/lib/xero.ts";

/**
 * The failure this file exists to catch: money leaving the system through the
 * wrong unit. Everything internal is integer cents; Xero takes decimal dollars.
 * Apply the conversion twice and a $1,234.56 invoice arrives as $12.35; skip it
 * and the same invoice arrives as $123,456. Xero accepts both without complaint,
 * so nothing downstream will tell you.
 */

const ITEMS: XeroSourceItem[] = [
  { kind: "material", description: "Colorbond Ultra sheeting", qty: 188, unit: "m²", unit_cost_cents: 4200 },
  { kind: "material", description: "Anticon blanket 60mm", qty: 188, unit: "m²", unit_cost_cents: 1350 },
  { kind: "labour", description: "Strip and dispose existing roof", qty: 24, unit: "hr", unit_cost_cents: 9500 },
];

const CLIENT = { name: "Margaret Chen", email: "margaret@example.com" };

/** GST off, 22% margin — the seeded prototype configuration. */
const QUOTE = {
  quote_number: "Q-2026-0007",
  roof_type: "Colorbond re-roof",
  margin_pct: 22,
  gst_enabled: false,
  gst_rate: 10,
};

const SETTINGS_NO_GST = { gst_registered: false, gst_rate: 10 };
const SETTINGS_GST = { gst_registered: true, gst_rate: 10 };

/** Sum of the marked-up line amounts — what a full-job invoice would bill. */
const FULL_TOTAL_CENTS = 188 * 5124 + 188 * 1647 + 24 * 11590;

function invoice(overrides: Partial<Parameters<typeof toXeroInvoicePayload>[0]> = {}) {
  return {
    invoice_number: "INV-2026-0001",
    kind: "final" as const,
    total_cents: FULL_TOTAL_CENTS,
    due_at: "2026-09-05",
    created_at: "2026-08-06T04:11:00.000Z",
    sent_at: "2026-08-06T04:11:00.000Z",
    ...overrides,
  };
}

describe("toXeroInvoicePayload — happy path", () => {
  const payload = toXeroInvoicePayload(invoice(), CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST);

  test("produces an accounts-receivable invoice Xero can accept", () => {
    assert.equal(payload.Type, "ACCREC");
    assert.equal(payload.Status, "AUTHORISED");
    assert.equal(payload.CurrencyCode, "AUD");
    assert.equal(payload.InvoiceNumber, "INV-2026-0001");
    assert.equal(payload.Reference, "Q-2026-0007", "the quote number is the reference");
    assert.deepEqual(payload.Contact, {
      Name: "Margaret Chen",
      EmailAddress: "margaret@example.com",
    });
  });

  test("dates are plain ISO days, taken in the business's timezone", () => {
    // 04:11 UTC on the 6th is mid-afternoon on the 6th in Sydney.
    assert.equal(payload.Date, "2026-08-06");
    assert.equal(payload.DueDate, "2026-09-05");
  });

  test("an invoice billing the whole quote is itemised line for line", () => {
    assert.equal(payload.LineItems.length, ITEMS.length);
    assert.deepEqual(payload.LineItems[0], {
      Description: "Colorbond Ultra sheeting",
      Quantity: 188,
      UnitAmount: 51.24,
      AccountCode: XERO_SALES_ACCOUNT_CODE,
      TaxType: "NONE",
    });
  });

  test("every amount is a sell price — supplier cost never reaches Xero", () => {
    const costs = ITEMS.map((i) => i.unit_cost_cents / 100);
    for (const line of payload.LineItems) {
      assert.ok(!costs.includes(line.UnitAmount), `${line.UnitAmount} is a cost, not a price`);
    }
    assert.equal(payload.LineItems[2].UnitAmount, 115.9, "$95.00/hr at 22% → $115.90");
  });

  test("a partial claim bills one summary line, not the whole scope", () => {
    // A deposit against the same quote must not ship the full line set: Xero
    // would total the job, not the claim.
    const deposit = toXeroInvoicePayload(
      invoice({ kind: "deposit", total_cents: 123456, invoice_number: "INV-2026-0002" }),
      CLIENT,
      QUOTE,
      ITEMS,
      SETTINGS_NO_GST,
    );
    assert.equal(deposit.LineItems.length, 1);
    assert.equal(deposit.LineItems[0].UnitAmount, 1234.56);
    assert.match(deposit.LineItems[0].Description, /^Deposit: Colorbond re-roof — quote Q-2026-0007$/);
  });
});

describe("the cents-to-dollars boundary is applied exactly once", () => {
  test("$1,234.56 arrives as 1234.56 — not 123456, not 12.3456", () => {
    const payload = toXeroInvoicePayload(
      invoice({ kind: "deposit", total_cents: 123456 }),
      CLIENT,
      QUOTE,
      ITEMS,
      SETTINGS_NO_GST,
    );
    const amount = payload.LineItems[0].UnitAmount;
    assert.equal(amount, 1234.56);
    assert.notEqual(amount, 123456, "cents leaked through unconverted");
    assert.notEqual(amount, 12.3456, "the conversion was applied twice");
  });

  test("the CSV carries the same figure, converted no further", () => {
    const payload = toXeroInvoicePayload(
      invoice({ kind: "deposit", total_cents: 123456 }),
      CLIENT,
      QUOTE,
      ITEMS,
      SETTINGS_NO_GST,
    );
    const csv = toXeroCsv(xeroCsvRows(payload));
    assert.match(csv, /,1234\.56,/);
    assert.doesNotMatch(csv, /,123456,/);
  });

  test("whole dollars stay whole, and sub-dollar amounts keep their cents", () => {
    const whole = toXeroInvoicePayload(
      invoice({ kind: "progress", total_cents: 400000 }),
      CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST,
    );
    assert.equal(whole.LineItems[0].UnitAmount, 4000);

    const small = toXeroInvoicePayload(
      invoice({ kind: "progress", total_cents: 5 }),
      CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST,
    );
    assert.equal(small.LineItems[0].UnitAmount, 0.05);
  });
});

describe("GST decides LineAmountTypes and TaxType", () => {
  test("registered and enabled on the quote → Exclusive / OUTPUT", () => {
    const payload = toXeroInvoicePayload(
      invoice({ total_cents: 110000 }),
      CLIENT,
      { ...QUOTE, gst_enabled: true },
      ITEMS,
      SETTINGS_GST,
    );
    assert.equal(payload.LineAmountTypes, "Exclusive");
    assert.equal(payload.LineItems[0].TaxType, "OUTPUT");
  });

  test("an unregistered business is NoTax however the quote is set", () => {
    const payload = toXeroInvoicePayload(
      invoice(),
      CLIENT,
      { ...QUOTE, gst_enabled: true },
      ITEMS,
      SETTINGS_NO_GST,
    );
    assert.equal(payload.LineAmountTypes, "NoTax", "registration is the master switch");
    assert.equal(payload.LineItems[0].TaxType, "NONE");
  });

  test("with GST on, a summary line is tax-exclusive so Xero adds it once", () => {
    // $1,100.00 collected at 10% is $1,000.00 of revenue plus $100.00 of GST.
    const payload = toXeroInvoicePayload(
      invoice({ kind: "deposit", total_cents: 110000 }),
      CLIENT,
      { ...QUOTE, gst_enabled: true },
      ITEMS,
      SETTINGS_GST,
    );
    assert.equal(payload.LineAmountTypes, "Exclusive");
    assert.equal(payload.LineItems[0].UnitAmount, 1000);
  });

  test("with GST off, the summary line is the total as billed", () => {
    const payload = toXeroInvoicePayload(
      invoice({ kind: "deposit", total_cents: 110000 }),
      CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST,
    );
    assert.equal(payload.LineItems[0].UnitAmount, 1100);
  });
});

describe("failure and edge cases", () => {
  test("a zero-line invoice produces a usable line, never NaN", () => {
    const payload = toXeroInvoicePayload(
      invoice({ kind: "progress", total_cents: 50000 }),
      CLIENT, QUOTE, [], SETTINGS_NO_GST,
    );
    assert.equal(payload.LineItems.length, 1, "Xero rejects an invoice with no lines");
    assert.ok(Number.isFinite(payload.LineItems[0].UnitAmount));
    assert.equal(payload.LineItems[0].UnitAmount, 500);
  });

  test("a zero-total, zero-line invoice is zero rather than NaN", () => {
    const payload = toXeroInvoicePayload(
      invoice({ total_cents: 0 }),
      CLIENT, QUOTE, [], SETTINGS_GST,
    );
    assert.equal(payload.LineItems.length, 1);
    assert.equal(payload.LineItems[0].UnitAmount, 0);
    assert.ok(!Number.isNaN(payload.LineItems[0].UnitAmount));
  });

  test("a malformed quantity contributes zero rather than poisoning the payload", () => {
    const bad = [{ ...ITEMS[0], qty: Number.NaN }];
    const payload = toXeroInvoicePayload(
      invoice({ total_cents: 0 }), CLIENT, QUOTE, bad, SETTINGS_NO_GST,
    );
    for (const line of payload.LineItems) {
      assert.ok(Number.isFinite(line.Quantity));
      assert.ok(Number.isFinite(line.UnitAmount));
    }
  });

  test("a missing client and quote still yield an importable invoice", () => {
    const payload = toXeroInvoicePayload(
      invoice({ due_at: null }), null, null, [], null,
    );
    assert.equal(payload.Contact.Name, "Unknown client");
    assert.equal(payload.Contact.EmailAddress, undefined);
    assert.equal(payload.Reference, undefined);
    assert.equal(payload.DueDate, undefined);
    assert.equal(payload.LineAmountTypes, "NoTax");
  });

  test("an unparseable issue date falls back to today rather than 'Invalid Date'", () => {
    const payload = toXeroInvoicePayload(
      invoice({ sent_at: "not a date", created_at: "not a date" }),
      CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST,
    );
    assert.match(payload.Date, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toXeroCsv", () => {
  const payload = toXeroInvoicePayload(invoice(), CLIENT, QUOTE, ITEMS, SETTINGS_NO_GST);

  test("emits Xero's exact header row", () => {
    const csv = toXeroCsv(xeroCsvRows(payload));
    assert.equal(csv.split("\r\n")[0], XERO_CSV_HEADERS.join(","));
    assert.match(csv, /^\*ContactName,EmailAddress,/);
  });

  test("one row per line item, all carrying the same invoice number", () => {
    const rows = xeroCsvRows(payload);
    assert.equal(rows.length, ITEMS.length);
    assert.ok(rows.every((r) => r.InvoiceNumber === "INV-2026-0001"));
    // Xero requires a due date on import even when the invoice has none.
    assert.ok(rows.every((r) => r.DueDate.length === 10));

    const body = toXeroCsv(rows).trimEnd().split("\r\n");
    assert.equal(body.length, ITEMS.length + 1, "header plus one row per line");
  });

  test("a header row alone is valid output when nothing is selected", () => {
    assert.equal(toXeroCsv([]), `${XERO_CSV_HEADERS.join(",")}\r\n`);
  });

  test("commas and quotes in a description are escaped, not truncated", () => {
    const rows = xeroCsvRows(
      toXeroInvoicePayload(
        invoice({ kind: "progress", total_cents: 10000 }),
        { name: 'Chen, Margaret "Maggie"', email: null },
        { ...QUOTE, roof_type: 'Re-roof, tiles to "Colorbond"' },
        [],
        SETTINGS_NO_GST,
      ),
    );
    const csv = toXeroCsv(rows);
    assert.match(csv, /"Chen, Margaret ""Maggie"""/);
    assert.match(csv, /"Progress claim: Re-roof, tiles to ""Colorbond"" — quote Q-2026-0007"/);
    assert.equal(csv.trimEnd().split("\r\n").length, 2, "escaping must not split the row");
  });
});
