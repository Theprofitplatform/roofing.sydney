import type { Metadata } from "next";
import { getSettings } from "@/lib/db/library";
import { listOpenTasks, listOpportunities, listStages } from "@/lib/db/pipeline";
import { listQuotes } from "@/lib/db/quotes";
import { moneyShort } from "@/lib/money";
import { nudgeLevel, nudgeText, quoteFlags, type QuoteFlags } from "@/lib/quote-state";
import { pipelineValue, quoteValueCents, type ReportQuote } from "@/lib/reports";
import { dayKey, relativeDay } from "./_workspace/dates";
import { toTaskRow } from "./_workspace/task-row";
import { Dashboard, type AttentionRow, type Kpi, type MovementRow } from "./_workspace/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

/** Stage colour, drawn only from pill modifiers the stylesheet actually defines. */
const STAGE_TONE: Record<string, string> = {
  enquiry: "draft",
  qualified: "draft",
  visit_booked: "viewed",
  quoted: "viewed",
  won: "sent",
  lost: "warning",
};

/** Worst first: already dead, then gone quiet, then merely running out of time. */
function severity(flags: QuoteFlags): number {
  if (flags.expired) return 0;
  if (flags.needsFollowUp) return 1;
  return 2;
}

export default async function CrmDashboard() {
  const [quotes, settings, tasks, opportunities, stages] = await Promise.all([
    listQuotes(),
    getSettings(),
    listOpenTasks(),
    listOpportunities(),
    listStages(),
  ]);

  const today = dayKey();
  const now = new Date();

  const reportRows: ReportQuote[] = quotes.map(({ quote, items, selectedItemIds }) => ({
    quote,
    items,
    selectedItemIds,
  }));
  const value = pipelineValue(reportRows);

  const drafts = quotes.filter((row) => row.quote.status === "draft").length;
  const awaiting = quotes.filter(
    (row) => row.quote.status === "sent" || row.quote.status === "viewed",
  ).length;

  const taskRows = tasks.map((task) => toTaskRow(task, today));
  const dueNow = taskRows.filter((task) => task.bucket !== "upcoming");

  const kpis: Kpi[] = [
    {
      icon: "pen-line",
      label: "Open drafts",
      value: String(drafts),
      sub: "Not yet issued",
    },
    {
      icon: "send",
      label: "Awaiting a decision",
      value: String(awaiting),
      sub: "Sent and still live",
    },
    {
      icon: "dollar-sign",
      label: "Value in the pipeline",
      value: moneyShort(value.open.totalCents),
      sub: `${value.open.count} live ${value.open.count === 1 ? "quote" : "quotes"}`,
    },
    {
      icon: "bell",
      label: "Due today or overdue",
      value: String(dueNow.length),
      sub: "Calls, visits, follow-ups",
      warn: dueNow.length > 0,
    },
  ];

  /**
   * The follow-up engine the prototype wrote and never wired up. A nudge that
   * only labels the problem is a shrug, so every row here carries a control.
   */
  const attention: AttentionRow[] = quotes
    .map((row) => ({ row, flags: quoteFlags(row.quote, settings, now) }))
    .filter((entry) => entry.flags.attention)
    .sort((a, b) => severity(a.flags) - severity(b.flags) || a.flags.daysLeft - b.flags.daysLeft)
    .slice(0, 8)
    .map(({ row, flags }) => ({
      quoteId: row.quote.id,
      quoteNumber: row.quote.quote_number ?? "Draft",
      clientId: row.client.id,
      clientName: row.client.name,
      subject: row.quote.roof_type || row.client.property_address,
      valueLabel: moneyShort(quoteValueCents({
        quote: row.quote,
        items: row.items,
        selectedItemIds: row.selectedItemIds,
      })),
      nudge: nudgeText(flags) ?? "needs a look",
      level: nudgeLevel(flags) ?? "warning",
    }));

  const stageLabel = new Map(stages.map((stage) => [stage.id, stage.label]));

  // listOpportunities returns oldest-updated first because that is what the board
  // wants; the dashboard wants the opposite end of the same ordering.
  const movement: MovementRow[] = [...opportunities]
    .reverse()
    .slice(0, 6)
    .map(({ opportunity, client }) => ({
      id: opportunity.id,
      clientId: client.id,
      clientName: client.name,
      stageLabel: stageLabel.get(opportunity.stage_id) ?? opportunity.stage_id,
      stageTone: STAGE_TONE[opportunity.stage_id] ?? "draft",
      whenLabel: relativeDay(opportunity.updated_at, today),
    }));

  return (
    <Dashboard kpis={kpis} attention={attention} tasks={dueNow.slice(0, 6)} movement={movement} />
  );
}
