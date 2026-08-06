import type { Metadata } from "next";
import {
  costAgeDays,
  getSettings,
  isCostStale,
  listPriceBook,
  listSnippets,
  listTemplates,
  STALE_COST_DAYS,
} from "@/lib/db/library";
import { signedPdfUrl } from "@/lib/db/portal";
import { SettingsScreen } from "./settings-screen";
import type { PriceBookRow } from "./price-book-tab";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, snippets, priceBook, templates] = await Promise.all([
    getSettings(),
    listSnippets(),
    // Archived rows come down too: without them a retired item simply vanishes,
    // and the operator has no way to see where the cost behind an old quote went.
    listPriceBook(true),
    listTemplates(),
  ]);

  // Staleness is decided here rather than in the tab: the helpers live in the
  // server-only db layer, and one measurement against the render beats each row
  // re-deriving a different "now" in the browser.
  const now = new Date();
  const rows: PriceBookRow[] = priceBook.map((item) => ({
    item,
    ageDays: costAgeDays(item, now),
    stale: isCostStale(item, now),
  }));

  // The bucket is private, so the logo is served through a short-lived signed
  // URL rather than a public link that would outlive the page.
  const logoUrl = settings.logo_path ? await signedPdfUrl(settings.logo_path) : null;

  return (
    <SettingsScreen
      settings={settings}
      logoUrl={logoUrl}
      snippets={snippets}
      priceBook={rows}
      staleAfterDays={STALE_COST_DAYS}
      templates={templates}
    />
  );
}
