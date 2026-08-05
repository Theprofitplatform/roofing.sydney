import { listJobs } from "@/lib/db/jobs";
import { listQuotes } from "@/lib/db/quotes";
import { JobsList } from "./jobs-list";
import { jobValueCents, type OpenableQuote } from "./job-view";

export const metadata = { title: "Jobs" };

export default async function JobsPage() {
  const [jobs, quotes] = await Promise.all([listJobs(), listQuotes()]);

  // One job per quote is enforced by a unique index, so quote_id identifies the
  // accepted quotes already spoken for. Whatever is left is signed work with
  // nowhere to be run from — the list's most useful thing to say.
  const spokenFor = new Set(jobs.map((row) => row.job.quote_id));
  const openable: OpenableQuote[] = quotes
    .filter((row) => row.quote.status === "accepted" && !spokenFor.has(row.quote.id))
    .map((row) => ({
      quoteId: row.quote.id,
      quoteNumber: row.quote.quote_number,
      clientName: row.client.name,
      propertyAddress: row.client.property_address,
      roofType: row.quote.roof_type,
      valueCents: jobValueCents(row.quote),
      acceptedAt: row.quote.accepted_at,
    }));

  return <JobsList jobs={jobs} openable={openable} />;
}
