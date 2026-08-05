import type { Metadata } from "next";
import { listClients } from "@/lib/db/clients";
import { listQuotes } from "@/lib/db/quotes";
import { quoteValueCents } from "@/lib/reports";
import { ClientsScreen, type ClientRow } from "./clients-screen";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const [clients, quotes] = await Promise.all([listClients(), listQuotes()]);

  // One pass over the whole book rather than a query per row; at a single
  // roofer's volume the round trips cost more than the arithmetic. Superseded
  // quotes are skipped — a revision and the parent it replaced are the same job,
  // and counting both would inflate every client's value.
  const tally = new Map<string, { count: number; valueCents: number }>();
  for (const row of quotes) {
    if (row.quote.status === "superseded") continue;
    const entry = tally.get(row.quote.client_id) ?? { count: 0, valueCents: 0 };
    entry.count += 1;
    entry.valueCents += quoteValueCents({
      quote: row.quote,
      items: row.items,
      selectedItemIds: row.selectedItemIds,
    });
    tally.set(row.quote.client_id, entry);
  }

  const rows: ClientRow[] = clients.map((client) => ({
    client,
    ...(tally.get(client.id) ?? { count: 0, valueCents: 0 }),
  }));

  return <ClientsScreen rows={rows} />;
}
