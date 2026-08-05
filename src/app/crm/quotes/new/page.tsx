import type { Metadata } from "next";

import { loadBuilderData } from "../builder-data";
import { Builder } from "../builder/builder";
import { draftFromTemplate, newDraft } from "../builder/state";

export const metadata: Metadata = { title: "New quote" };

/**
 * A new quote has no row yet, deliberately.
 *
 * Creating one on arrival would leave a dead draft behind every time someone
 * opened this screen and changed their mind. The builder writes the row on its
 * first autosave — once there is a client and a described line to save — and
 * swaps the URL to that draft's editor without remounting.
 */
export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const [{ template }, data] = await Promise.all([searchParams, loadBuilderData()]);

  const chosen = template ? (data.templates.find((t) => t.id === template) ?? null) : null;
  const initial = chosen
    ? draftFromTemplate(chosen, data.settings, data.snippets)
    : newDraft(data.settings, data.snippets);

  return (
    <Builder
      quoteId={null}
      version={1}
      initial={initial}
      clients={data.clients}
      snippets={data.snippets}
      priceBook={data.priceBook}
      initialPhotos={[]}
      marginFloorPct={data.settings.margin_floor_pct}
      gstRegistered={data.settings.gst_registered}
    />
  );
}
