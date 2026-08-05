import { Icon, RoofMark } from "@/components/crm/icon";
import type { PortalView } from "./view-model";

/**
 * The parts of the quote that do not move.
 *
 * Pure presentation with no hooks and no server imports, so the page renders it
 * on the server and the interactive half can reuse `StateBanner` without either
 * side having to duplicate the markup.
 */

export function BusinessLockup({ business }: { business: PortalView["business"] }) {
  const identity = [business.legalName, business.address].filter(Boolean).join(" · ");
  return (
    <div className="portal__brand">
      <span className="portal__mark" aria-hidden="true">
        <RoofMark size={24} />
      </span>
      <div>
        <div className="portal__name">{business.name}</div>
        {identity && <div className="portal__org">{identity}</div>}
      </div>
    </div>
  );
}

/**
 * A one-word status, shown only when the quote is not simply live. A homeowner
 * opening an expired link should see that before they read a price.
 */
function statusPill(view: PortalView): { label: string; className: string } | null {
  if (view.status === "accepted") return { label: "Accepted", className: "pill--accepted" };
  if (view.status === "declined") return { label: "Declined", className: "pill--warning" };
  if (view.status === "superseded") return { label: "Replaced", className: "pill--warning" };
  if (view.expired) return { label: "Expired", className: "pill--warning" };
  return null;
}

export function DocumentHead({ view }: { view: PortalView }) {
  const pill = statusPill(view);
  return (
    <div className="qdoc__head">
      <div>
        <div className="qdoc__title">
          Your quote
          {pill && (
            <span className={`pill ${pill.className}`} style={{ marginLeft: 12, verticalAlign: 6 }}>
              {pill.label}
            </span>
          )}
        </div>
        <div className="qdoc__sub">
          {view.roofType} · prepared for {view.client.name}
        </div>
      </div>
      <div className="qdoc__meta">
        <div>
          <b>{view.quoteNumber}</b>
        </div>
        <div>Issued {view.issuedLabel}</div>
        <div>
          Valid for {view.validDays} days — until {view.validUntilLabel}
        </div>
      </div>
    </div>
  );
}

export function Parties({ view }: { view: PortalView }) {
  return (
    <div className="qparties">
      <div>
        <div className="qparties__label">Prepared for</div>
        <div className="qparties__name">{view.client.name}</div>
        {view.client.phone && <div className="qparties__line">{view.client.phone}</div>}
        {view.client.email && <div className="qparties__line">{view.client.email}</div>}
      </div>
      {view.client.propertyAddress && (
        <div>
          <div className="qparties__label">Property</div>
          <div className="qparties__name">{view.client.propertyAddress}</div>
        </div>
      )}
    </div>
  );
}

export function JobBlock({ view }: { view: PortalView }) {
  return (
    <div className="qjob">
      <div className="qjob__label">The work</div>
      <div className="qjob__value">{view.roofType}</div>
      {view.notes && <div className="qjob__note">{view.notes}</div>}
    </div>
  );
}

export function ClauseColumns({
  inclusions,
  exclusions,
}: {
  inclusions: string[];
  exclusions: string[];
}) {
  if (inclusions.length === 0 && exclusions.length === 0) return null;
  return (
    <div className="qclauses">
      {inclusions.length > 0 && (
        <div>
          <div className="qsec__h">What&rsquo;s included</div>
          {inclusions.map((text, i) => (
            <div className="qclause qclause--inc" key={`inc-${i}`}>
              <Icon name="check" size={13} strokeWidth={2.6} color="var(--brand)" />
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
      {exclusions.length > 0 && (
        <div>
          <div className="qsec__h">Not included</div>
          {exclusions.map((text, i) => (
            <div className="qclause" key={`exc-${i}`}>
              <Icon name="minus" size={13} strokeWidth={2.6} />
              <span>{text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Owner-supplied wording, printed exactly as written. Never generated. */
export function PaymentTerms({ terms }: { terms: string | null }) {
  if (!terms) return null;
  return (
    <div className="qsec">
      <div className="qsec__h">Payment terms</div>
      <div className="qterms">{terms}</div>
    </div>
  );
}

export function PortalFooter({ business }: { business: PortalView["business"] }) {
  const line = [
    business.legalName ?? business.name,
    business.licenceNo && `Licence ${business.licenceNo}`,
    business.abn && `ABN ${business.abn}`,
    business.acn && `ACN ${business.acn}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="portal__foot">
      <div>{line}</div>
      <div>
        {business.phone && <a href={`tel:${business.phone.replace(/\s+/g, "")}`}>{business.phone}</a>}
        {business.phone && business.email && " · "}
        {business.email && <a href={`mailto:${business.email}`}>{business.email}</a>}
      </div>
    </footer>
  );
}

export type BannerTone = "ok" | "warn" | "neutral";

export function StateBanner({
  tone,
  icon,
  title,
  children,
}: {
  tone: BannerTone;
  icon: string;
  title: string;
  children?: React.ReactNode;
}) {
  const toneClass = tone === "ok" ? "qstate--ok" : tone === "warn" ? "qstate--warn" : "";
  const colour =
    tone === "ok"
      ? "var(--status-success)"
      : tone === "warn"
        ? "var(--status-warning)"
        : "var(--muted-foreground)";

  return (
    <div className={`qstate ${toneClass}`}>
      <span className="qstate__icon">
        <Icon name={icon} size={19} color={colour} />
      </span>
      <div>
        <div className="qstate__title">{title}</div>
        {children && <div className="qstate__body">{children}</div>}
      </div>
    </div>
  );
}
