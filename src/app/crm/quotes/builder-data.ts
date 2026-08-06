import "server-only";

import { listClients } from "@/lib/db/clients";
import {
  costAgeDays,
  getSettings,
  isCostStale,
  listPriceBook,
  listSnippets,
  listTemplates,
} from "@/lib/db/library";
import type { PriceBookRow } from "./builder/state";

/**
 * Everything the builder needs that is not the quote itself.
 *
 * Cost staleness is resolved here, on the server, for two reasons: `isCostStale`
 * lives in the server-only db layer, and "how old is this cost" is a fact about
 * the moment the page was rendered rather than about the browser's clock.
 */
export async function loadBuilderData() {
  const [clients, snippets, priceBook, settings, templates] = await Promise.all([
    listClients(),
    listSnippets(),
    listPriceBook(),
    getSettings(),
    listTemplates(),
  ]);

  const now = new Date();
  const rows: PriceBookRow[] = priceBook.map((item) => ({
    id: item.id,
    kind: item.kind,
    category: item.category,
    description: item.description,
    unit: item.unit,
    unit_cost_cents: item.unit_cost_cents,
    supplier: item.supplier,
    costAgeDays: costAgeDays(item, now),
    isStale: isCostStale(item, now),
  }));

  return { clients, snippets, settings, templates, priceBook: rows };
}
