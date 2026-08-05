import type { Metadata } from "next";

import { listQuotes } from "@/lib/db/quotes";
import { getSettings, listTemplates } from "@/lib/db/library";
import { QuotesTable } from "./quotes-table";

export const metadata: Metadata = { title: "Quotes" };

/**
 * The list prices every row live from its own line items rather than reading a
 * stored total, so a draft edited two minutes ago shows the figure the operator
 * just typed. Issued quotes still win with their frozen total — see
 * `quoteTotalCents` in ./helpers.
 */
export default async function QuotesPage() {
  const [rows, settings, templates] = await Promise.all([
    listQuotes(),
    getSettings(),
    listTemplates(),
  ]);

  return (
    <QuotesTable
      rows={rows}
      followUpDays={settings.follow_up_days}
      templates={templates.map((t) => ({
        id: t.id,
        label: t.label,
        sub: t.sub,
        icon: t.icon ?? "file",
        lines: (t.line_items ?? []).length,
      }))}
    />
  );
}
