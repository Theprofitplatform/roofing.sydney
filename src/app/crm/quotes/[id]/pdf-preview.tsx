"use client";

import { useEffect, useRef, useState } from "react";

import { Icon, RoofMark } from "@/components/crm/icon";
import { depositCents, displayAmountCents, displayUnitCents, money } from "@/lib/money";
import {
  defaultSelection,
  extraDelta,
  offeredTiers,
  priceSelection,
  resolveScope,
  type Selection,
} from "@/lib/quote-pricing";
import type { Client, Quote, QuoteClause, QuoteItem, Settings, Tier } from "@/lib/db/types";
import type { PhotoView } from "../helpers";

/**
 * The on-screen A4 preview.
 *
 * This is a PREVIEW, not the artefact. What the client receives is rendered
 * server-side by `@/lib/pdf/render` and stored once at issue; this mirrors
 * `design-reference/quoting-tool/app/pdf.jsx` and the `.pdf*` rules in crm.css
 * so the operator can see what they are about to send without waiting on a
 * round trip. If the two ever disagree, the stored PDF is the truth.
 *
 * Every price here is `displayUnitCents` / `displayAmountCents` — cost marked up
 * by the quote's margin. `computeTotals` is deliberately not imported: its
 * `margin` and `subtotal` are internal figures, and one of them appearing on
 * this page is the single defect that costs the owner a job.
 *
 * Scope is resolved here the same way the renderer resolves it, from the whole
 * item set. A preview handed a pre-resolved list cannot show the optional
 * extras the artefact prints, and would have the operator sending a document
 * with a section they never saw.
 */

const DAY_MS = 86_400_000;

const TIER_LABEL: Record<Tier, string> = { good: "Good", better: "Better", best: "Best" };

const formatDate = (date: Date): string =>
  date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

const joinDot = (parts: (string | null | undefined | false)[]): string =>
  parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");

export interface QuoteDocumentProps {
  quote: Quote;
  client: Client;
  settings: Settings;
  /** Every line on the quote. Tier and extras are resolved below, not by the caller. */
  items: QuoteItem[];
  clauses: QuoteClause[];
  photos: PhotoView[];
}

function ItemTable({
  caption,
  rows,
  marginPct,
}: {
  caption: string;
  rows: QuoteItem[];
  marginPct: number;
}) {
  return (
    <table className="pdf-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th style={{ width: "52%" }}>Description</th>
          <th className="r">Qty</th>
          <th>Unit</th>
          <th className="r">Unit price</th>
          <th className="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.id}>
            <td className="desc">{item.description}</td>
            <td className="r num">{Number(item.qty)}</td>
            <td>{item.unit}</td>
            <td className="r num">{money(displayUnitCents(item, marginPct))}</td>
            <td className="r num">{money(displayAmountCents(item, marginPct))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QuoteDocument({
  quote,
  client,
  settings,
  items,
  clauses,
  photos,
}: QuoteDocumentProps) {
  const modern = quote.pdf_layout === "modern";

  // An accepted quote records its tier on the row, so the preview of a signed
  // document prices the option the client actually took rather than the
  // cheapest one on offer.
  const accepted = quote.selected_tier ?? null;
  const chosen: Selection =
    accepted !== null ? { tier: accepted, optionalIds: [] } : defaultSelection(items);

  const inScope = new Set(resolveScope(items, chosen).map((i) => i.id));
  const priced = items.filter((i) => inScope.has(i.id));

  const materials = priced.filter((i) => i.kind === "material");
  const labour = priced.filter((i) => i.kind === "labour");
  const inclusions = clauses.filter((c) => c.kind === "inclusion");
  const exclusions = clauses.filter((c) => c.kind === "exclusion");

  // An optional line carrying a tier belongs to that tier, so one attached to
  // an option the client did not take is not on offer and must not be priced.
  const extras = items.filter(
    (i) => i.is_optional && !inScope.has(i.id) && (i.tier === null || i.tier === chosen.tier),
  );
  const tierLabel =
    offeredTiers(items).length > 0 && chosen.tier ? TIER_LABEL[chosen.tier] : null;

  const { display: totals } = priceSelection(quote, items, chosen);
  const depositDue = settings.deposit_enabled
    ? depositCents(totals.total, settings.deposit_pct)
    : 0;

  const number = quote.quote_number ?? "DRAFT";
  const issued = new Date(quote.sent_at ?? quote.created_at);
  const validUntil = new Date(issued.getTime() + quote.valid_days * DAY_MS);

  const orgTag = joinDot([
    settings.legal_name && settings.business_name
      ? settings.legal_name.replace(settings.business_name, "").trim()
      : settings.legal_name,
    settings.address,
  ]);

  const orgLines = (
    <>
      {settings.licence_no && <div className="lic">Licence {settings.licence_no}</div>}
      <div>
        {joinDot([
          settings.abn && `ABN ${settings.abn}`,
          settings.acn && `ACN ${settings.acn}`,
        ])}
      </div>
      {settings.phone && <div>{settings.phone}</div>}
      {settings.email && <div>{settings.email}</div>}
    </>
  );

  const lockup = (onBrand: boolean) => (
    <div className="pdf-logo">
      <span className={`pdf-logo__mark ${onBrand ? "pdf-logo__mark--ghost" : ""}`}>
        <RoofMark size={26} />
      </span>
      <div>
        <div className="pdf-logo__name">{settings.business_name}</div>
        <div className={`pdf-logo__tag ${onBrand ? "pdf-logo__tag--on" : ""}`}>{orgTag}</div>
      </div>
    </div>
  );

  return (
    <div className={`pdf ${modern ? "pdf--modern" : ""}`}>
      {modern ? (
        <div className="pdf__band">
          {lockup(true)}
          <div className="pdf__org pdf__org--on">{orgLines}</div>
        </div>
      ) : (
        <div className="pdf__head">
          {lockup(false)}
          <div className="pdf__org">{orgLines}</div>
        </div>
      )}

      <div className="pdf__title-row">
        <div className="pdf__title">Quotation</div>
        <div className="pdf__meta">
          <div>
            <b>{number}</b>
          </div>
          <div>Issued {formatDate(issued)}</div>
          <div>
            Valid for {quote.valid_days} days — until {formatDate(validUntil)}
          </div>
        </div>
      </div>

      <div className="pdf__parties">
        <div>
          <div className="pdf__party-label">Prepared for</div>
          <div className="pdf__party-name">{client.name}</div>
          {client.phone && <div className="pdf__party-line">{client.phone}</div>}
          {client.email && <div className="pdf__party-line">{client.email}</div>}
        </div>
        <div>
          <div className="pdf__party-label">Property</div>
          <div className="pdf__party-name" style={{ fontWeight: 600, fontSize: 13 }}>
            {client.property_address}
          </div>
        </div>
      </div>

      <div className="pdf__job">
        <div className="pdf__job-grid">
          <div className="pdf__job-item">
            <div className="l">Job</div>
            <div className="v">{quote.roof_type || "Roofing works"}</div>
          </div>
          {/* Which of the offered options this paper prices. Without it a
              tiered quote is three different prices wearing one number. */}
          {tierLabel && (
            <div className="pdf__job-item">
              <div className="l">Option</div>
              <div className="v">{tierLabel}</div>
            </div>
          )}
        </div>
        {quote.notes && <div className="pdf__job-note">{quote.notes}</div>}
      </div>

      {quote.show_breakdown ? (
        <>
          {materials.length > 0 && (
            <ItemTable caption="Materials" rows={materials} marginPct={quote.margin_pct} />
          )}
          {labour.length > 0 && (
            <ItemTable caption="Labour" rows={labour} marginPct={quote.margin_pct} />
          )}
        </>
      ) : (
        <div className="pdf__single">
          <div className="d">
            Supply and install — {quote.roof_type || "roofing works"} as described above
          </div>
          <div className="num" style={{ font: "700 15px/1 var(--font-mono)" }}>
            {money(totals.subtotal)}
          </div>
        </div>
      )}

      <div className="pdf__totals">
        <div className="pdf__totals-inner">
          {quote.gst_enabled ? (
            <>
              <div className="pdf__total-row">
                <span>Subtotal (ex GST)</span>
                <span className="v">{money(totals.subtotal)}</span>
              </div>
              <div className="pdf__total-row">
                <span>GST {quote.gst_rate}%</span>
                <span className="v">{money(totals.gst)}</span>
              </div>
              <div className="pdf__total-grand">
                <span className="l">Total inc GST</span>
                <span className="v">{money(totals.total)}</span>
              </div>
            </>
          ) : (
            <div className="pdf__total-grand">
              <span className="l">Total</span>
              <span className="v">{money(totals.total)}</span>
            </div>
          )}
          {depositDue > 0 && (
            <div className="pdf__total-row" style={{ marginTop: 8 }}>
              <span>Deposit due on acceptance ({settings.deposit_pct}%)</span>
              <span className="v">{money(depositDue)}</span>
            </div>
          )}
          {!quote.gst_enabled && (
            <div
              style={{
                textAlign: "right",
                font: "400 10px/1.4 var(--font-sans)",
                color: "#9aa0ac",
                marginTop: 6,
              }}
            >
              No GST — supplier is not registered for GST.
            </div>
          )}
        </div>
      </div>

      {extras.length > 0 && (
        <>
          <table className="pdf-table">
            <caption>Optional extras</caption>
            <thead>
              <tr>
                <th style={{ width: "52%" }}>Description</th>
                <th className="r">Qty</th>
                <th>Unit</th>
                <th className="r">Unit price</th>
                <th className="r">Adds</th>
              </tr>
            </thead>
            <tbody>
              {extras.map((item) => (
                <tr key={item.id}>
                  <td className="desc">{item.description}</td>
                  <td className="r num">{Number(item.qty)}</td>
                  <td>{item.unit}</td>
                  <td className="r num">{money(displayUnitCents(item, quote.margin_pct))}</td>
                  {/* The change in the total, not the line's own amount — with
                      the breakdown shown the subtotal is a sum of rounded
                      lines, so this is the only figure the client can verify by
                      subtraction. */}
                  <td className="r num">{money(extraDelta(quote, items, chosen, item.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            style={{
              font: "400 10px/1.4 var(--font-sans)",
              color: "#9aa0ac",
              margin: "4px 0 10px",
            }}
          >
            Not included in the total above. Let us know which extras you want before accepting and
            we will re-issue the quote with them priced in.
          </div>
        </>
      )}

      <div className="pdf__clauses">
        <div>
          <div className="pdf__clause-h">Inclusions</div>
          {inclusions.map((clause) => (
            <div className="pdf__clause-li inc" key={clause.id}>
              <Icon name="check" size={12} strokeWidth={2.6} color="var(--brand)" />
              <span>{clause.text}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="pdf__clause-h">Exclusions</div>
          {exclusions.map((clause) => (
            <div className="pdf__clause-li" key={clause.id}>
              <Icon name="minus" size={12} strokeWidth={2.6} color="#9aa0ac" />
              <span>{clause.text}</span>
            </div>
          ))}
        </div>
      </div>

      {quote.include_photos && photos.length > 0 && (
        <div className="pdf__photos">
          <div className="pdf__clause-h">Site photos</div>
          <div className="pdf__photo-row">
            {photos.map((photo) => (
              <div className="pdf__photo-cell" key={photo.id}>
                <div
                  className="pdf__photo"
                  style={
                    photo.url
                      ? {
                          backgroundImage: `url(${photo.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }
                      : { background: "#e3e6ec" }
                  }
                />
                {photo.caption && <div className="pdf__photo-cap">{photo.caption}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pdf__foot">
        {settings.payment_terms && (
          <div className="pdf__terms">
            <b>Payment terms.</b> {settings.payment_terms}
          </div>
        )}
        <div className="pdf__accept-stmt">
          Acceptance — I/we accept quote {number} as described above, including the inclusions,
          exclusions and payment terms.
        </div>
        <div className="pdf__accept">
          <div className="pdf__accept-field">
            <div className="line" />
            <div className="l">Accepted by (print name)</div>
          </div>
          <div className="pdf__accept-field">
            <div className="line" />
            <div className="l">Signature</div>
          </div>
          <div className="pdf__accept-field">
            <div className="line" />
            <div className="l">Date</div>
          </div>
        </div>
        <div className="pdf__legal">
          {joinDot([
            settings.legal_name,
            settings.licence_no && `Licence ${settings.licence_no}`,
            settings.abn && `ABN ${settings.abn}`,
            settings.email,
            settings.site,
          ])}
        </div>
      </div>
    </div>
  );
}

/** Scales the fixed 794px page down to whatever width the stage has. */
export function PdfViewport(props: QuoteDocumentProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const available = stage.clientWidth - 56;
      setScale(Math.max(0.34, Math.min(1, available / 794)));
      if (pageRef.current) setHeight(pageRef.current.offsetHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    // Fonts and images settle a frame or two after the first paint.
    const timer = setTimeout(measure, 120);

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [props]);

  return (
    <div className="pdf-stage" ref={stageRef}>
      <div style={{ width: 794 * scale, height: height * scale }}>
        <div ref={pageRef} style={{ width: 794, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <QuoteDocument {...props} />
        </div>
      </div>
    </div>
  );
}
