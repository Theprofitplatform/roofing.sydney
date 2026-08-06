import Link from "next/link";
import { Icon } from "@/components/crm/icon";
import { Card, EmptyState, PageHeader } from "@/components/crm/ui";
import { listClients } from "@/lib/db/clients";
import { listOpportunities } from "@/lib/db/pipeline";
import { listQuotes } from "@/lib/db/quotes";
import {
  byJobType,
  byMonth,
  bySource,
  lossReasons,
  marginSummary,
  pipelineValue,
  winRate,
  type ReportQuote,
} from "@/lib/reports";
import { ConversionTable, LossReasons, PipelineTable } from "./breakdowns";
import { Headline } from "./headline";
import { MonthChart } from "./month-chart";

export const metadata = { title: "Reports" };

/**
 * One dense page, no tabs. A roofer checks this between jobs, so anything that
 * needs a second click to reach is a figure that never gets looked at.
 *
 * Every aggregate comes from `lib/reports.ts`; nothing is recomputed here. What
 * this file decides is which figures are honest enough to print — see the
 * thin-sample rule in `format.ts`.
 */
export default async function ReportsPage() {
  const [quotes, clients, opportunities] = await Promise.all([
    listQuotes(),
    listClients(),
    listOpportunities(),
  ]);

  // Lead source lives on the client, not the quote, and the list query does not
  // carry it. One extra read over a single roofer's client book is cheaper than
  // widening the shared select for one screen.
  const sourceByClient = new Map(clients.map((client) => [client.id, client.source]));
  const rows: ReportQuote[] = quotes.map(({ quote, client, items, selectedItemIds }) => ({
    quote,
    items,
    // Without the client's chosen extras every accepted tiered quote reports
    // against the wrong scope, and achieved margin is the headline figure here.
    selectedItemIds,
    source: sourceByClient.get(client.id) ?? null,
  }));

  const rate = winRate(rows);
  const pipeline = pipelineValue(rows);
  const margin = marginSummary(rows);

  return (
    <div className="stack-6">
      <PageHeader
        title="Reports"
        description="What you win, what you lose, and the margin you actually bank."
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="bar-chart-3"
            title="Nothing to report yet"
            actions={
              <Link href="/quotes/new" className="btn btn--brand">
                <Icon name="plus" size={15} />
                New quote
              </Link>
            }
          >
            Reporting begins with quotes. Build a few and issue them, and this page
            will start telling you which work converts and what margin survives
            contact with a client.
          </EmptyState>
        </Card>
      ) : (
        <>
          {rate.decided === 0 && (
            <div className="inline-warn" style={{ marginTop: 0 }}>
              <Icon name="info" size={15} />
              <span>
                No quote has reached an outcome yet. Until quotes start coming back
                accepted or declined, the conversion figures below are arithmetic
                over an empty set — the value totals are real, the percentages are
                not yet measuring anything.
              </span>
            </div>
          )}

          <Headline rate={rate} pipeline={pipeline} margin={margin} />

          <PipelineTable pipeline={pipeline} />

          <MonthChart buckets={byMonth(rows)} />

          <ConversionTable
            title="Conversion by job type"
            sub="Which work you are actually good at winning — and which you keep pricing for practice."
            dimension="Job type"
            rows={byJobType(rows)}
            empty="No job types recorded yet. Set the roof type on a quote and it will group here."
          />

          <ConversionTable
            title="Conversion by lead source"
            sub="Which marketing to keep paying for. Source comes from the client record, set when the enquiry arrived."
            dimension="Lead source"
            rows={bySource(rows)}
            empty="No lead sources recorded yet."
          />

          <LossReasons
            reasons={lossReasons(opportunities.map((card) => card.opportunity))}
          />
        </>
      )}
    </div>
  );
}
