import { notFound } from "next/navigation";
import { getQuoteByPortalToken } from "@/lib/db/quotes";
import { isPlausibleToken, recordView, signedPdfUrl } from "@/lib/db/portal";
import { getPortalSettings } from "../portal-settings";
import { buildView } from "./view-model";
import {
  BusinessLockup,
  ClauseColumns,
  DocumentHead,
  JobBlock,
  Parties,
  PaymentTerms,
  PortalFooter,
} from "./document";
import { PortalQuote } from "./portal-quote";

/**
 * The client quote portal.
 *
 * No login and no Supabase session: the high-entropy token in the URL is the
 * credential, because an account is friction at exactly the moment you want a
 * signature. Everything a homeowner is shown here is the marked-up, client-facing
 * document — cost and margin do not cross this boundary in any form.
 */

// Every open records a view and reflects a status the client may have changed a
// second ago. Nothing about this page may be cached.
export const dynamic = "force-dynamic";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Shape first. A malformed token costs a regex rather than a database round
  // trip, and gets exactly the answer a wrong one gets — the response must leak
  // nothing about whether a quote exists.
  if (!isPlausibleToken(token)) notFound();

  // First open stamps `viewed_at` and clears the operator's follow-up nudge;
  // later opens leave it alone. Failing to record must not decide whether the
  // page renders — the read below is the authority on whether this token
  // resolves, and a missed stamp costs a chase, not a client their quote.
  await recordView(token).catch(() => null);

  const detail = await getQuoteByPortalToken(token);
  // A draft is not a document. Even with a valid token, nothing that was never
  // issued is readable here.
  if (!detail || !detail.quote.sent_at) notFound();

  const [settings, pdfUrl] = await Promise.all([
    getPortalSettings(),
    detail.quote.pdf_path ? signedPdfUrl(detail.quote.pdf_path) : Promise.resolve(null),
  ]);

  const view = buildView(detail, settings, pdfUrl);

  return (
    <>
      <div className="portal__wrap">
        <BusinessLockup business={view.business} />

        <div className="qdoc">
          <DocumentHead view={view} />

          {view.pdfUrl && (
            <div className="qdoc__actions">
              {/* Signed and short-lived: the bucket is private, and a link that
                  never expires is a link that leaks. */}
              <a className="btn btn--outline btn--sm" href={view.pdfUrl} target="_blank" rel="noreferrer">
                Download a PDF copy
              </a>
            </div>
          )}

          <Parties view={view} />
          <JobBlock view={view} />

          <PortalQuote view={view}>
            <div className="qsec">
              <ClauseColumns inclusions={view.inclusions} exclusions={view.exclusions} />
            </div>
            <PaymentTerms terms={view.paymentTerms} />
          </PortalQuote>
        </div>
      </div>

      <PortalFooter business={view.business} />
    </>
  );
}
