import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getQuote, listRevisions } from "@/lib/db/quotes";
import { getSettings } from "@/lib/db/library";
import { defaultFollowUpBody, defaultQuoteBody, defaultQuoteSubject } from "@/lib/email-quote";
import { defaultSelection, priceSelection } from "@/lib/quote-pricing";
import { portalUrl } from "@/lib/urls";

import { listPhotoViews } from "../photo-storage";
import { quoteLabel, scopeFromQuoteItems } from "../helpers";
import { QuoteView } from "./quote-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = await getQuote(id);
  return { title: detail ? quoteLabel(detail.quote) : "Quote" };
}

/**
 * The email drafts are composed here rather than in the browser because
 * `@/lib/email-quote` is server-only — and because the operator should be
 * editing the same wording the system would have sent unattended.
 */
export default async function QuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ send?: string }>;
}) {
  const [{ id }, { send }] = await Promise.all([params, searchParams]);

  const detail = await getQuote(id);
  if (!detail) notFound();

  const [settings, revisions, photos] = await Promise.all([
    getSettings(),
    // One level of lineage: from the root, or from this quote if it is the root.
    listRevisions(detail.quote.parent_quote_id ?? detail.quote.id),
    listPhotoViews(detail.photos),
  ]);

  const scope = scopeFromQuoteItems(detail.items);
  const priced = priceSelection(detail.quote, scope, defaultSelection(scope));
  const totalCents = detail.quote.total_cents ?? priced.display.total;

  const portal = portalUrl(detail.quote.portal_token);

  return (
    <QuoteView
      quote={detail.quote}
      client={detail.client}
      items={detail.items}
      clauses={detail.clauses}
      photos={photos}
      settings={settings}
      revisions={revisions}
      portalUrl={portal}
      defaultSubject={defaultQuoteSubject(detail.quote, settings)}
      // Null on purpose: the token is minted by `issue_quote`, so a draft has no
      // link yet. The action appends it after the number is drawn.
      defaultBody={defaultQuoteBody(detail.quote, detail.client, settings, totalCents, null)}
      followUpSubject={`Following up — ${quoteLabel(detail.quote)}`}
      followUpBody={defaultFollowUpBody(detail.quote, detail.client, settings, portal)}
      openSend={send === "1"}
    />
  );
}
