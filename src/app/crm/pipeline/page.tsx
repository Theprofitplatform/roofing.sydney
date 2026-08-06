import type { Metadata } from "next";
import { getSettings } from "@/lib/db/library";
import { listOpportunities, listStages, listUnconvertedLeads } from "@/lib/db/pipeline";
import { listQuotes } from "@/lib/db/quotes";
import { quoteValueCents } from "@/lib/reports";
import { dayKey, daysSince, formatShortDay } from "../_workspace/dates";
import { Board } from "./board";
import type { BoardCard } from "./card";
import type { LeadRow } from "./leads";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const [stages, opportunities, leads, quotes, settings] = await Promise.all([
    listStages(),
    listOpportunities(),
    listUnconvertedLeads(),
    listQuotes(),
    getSettings(),
  ]);

  /**
   * What each opportunity is worth: the newest quote against it that has not been
   * superseded. Summing every quote would double-count a revision — a v2 replaces
   * a v1, it does not add to it.
   *
   * `quoteValueCents` owns the precedence, and it has to: a quote accepted on the
   * Best tier with extras ticked carries an `accepted_total_cents` well above the
   * `total_cents` frozen at issue, so preferring the issued figure would show a
   * won card at its base-scope price and understate the board.
   */
  const valueByOpportunity = new Map<string, number>();
  for (const row of quotes) {
    const opportunityId = row.quote.opportunity_id;
    if (!opportunityId || row.quote.status === "superseded") continue;
    if (valueByOpportunity.has(opportunityId)) continue;
    valueByOpportunity.set(
      opportunityId,
      quoteValueCents({
        quote: row.quote,
        items: row.items,
        selectedItemIds: row.selectedItemIds,
      }),
    );
  }

  const today = dayKey();

  const cards: BoardCard[] = opportunities.map(({ opportunity, client, quote_count }) => ({
    id: opportunity.id,
    clientId: client.id,
    clientName: client.name,
    propertyAddress: client.property_address,
    // Intake titles a card with the address, which is already on the line above.
    subject:
      opportunity.roof_type?.trim() ||
      (opportunity.title && opportunity.title !== client.property_address
        ? opportunity.title
        : null),
    stageId: opportunity.stage_id,
    lostReason: opportunity.lost_reason,
    quoteCount: quote_count,
    valueCents: valueByOpportunity.get(opportunity.id) ?? null,
    stageDays: daysSince(opportunity.updated_at, today),
  }));

  const leadRows: LeadRow[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    address: lead.address,
    colour: lead.selected_colour_name,
    bestTime: lead.best_time,
    receivedLabel: formatShortDay(lead.created_at),
  }));

  return (
    <Board
      stages={stages}
      cards={cards}
      leads={leadRows}
      staleAfterDays={settings.follow_up_days}
    />
  );
}
