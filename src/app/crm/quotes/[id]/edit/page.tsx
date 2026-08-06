import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getQuote } from "@/lib/db/quotes";
import { loadBuilderData } from "../../builder-data";
import { listPhotoViews } from "../../photo-storage";
import { Builder } from "../../builder/builder";
import { draftFromQuote } from "../../builder/state";

export const metadata: Metadata = { title: "Edit quote" };

/**
 * An issued quote never opens here.
 *
 * The database would reject the write anyway — `quotes_immutable` and its
 * sibling triggers on items and clauses see to that — but letting an operator
 * spend ten minutes editing a document that cannot be saved is a worse failure
 * than refusing at the door. The view screen offers "Revise" in its place.
 */
export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const detail = await getQuote(id);
  if (!detail) notFound();
  if (detail.quote.sent_at) redirect(`/quotes/${id}`);

  const [data, photos] = await Promise.all([
    loadBuilderData(),
    listPhotoViews(detail.photos),
  ]);

  return (
    <Builder
      quoteId={detail.quote.id}
      version={detail.quote.version}
      initial={draftFromQuote(detail)}
      clients={data.clients}
      snippets={data.snippets}
      priceBook={data.priceBook}
      initialPhotos={photos}
      marginFloorPct={data.settings.margin_floor_pct}
      gstRegistered={data.settings.gst_registered}
    />
  );
}
