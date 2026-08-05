import { notFound } from "next/navigation";
import { getJob, listAttachments, listVariations } from "@/lib/db/jobs";
import { listInvoices } from "@/lib/db/invoices";
import { getSettings } from "@/lib/db/library";
import { JobDetail } from "./job-detail";

export const metadata = { title: "Job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = await getJob(id);
  if (!row) notFound();

  const [variations, attachments, invoices, settings] = await Promise.all([
    listVariations(id),
    listAttachments(id),
    listInvoices(),
    getSettings(),
  ]);

  // A deposit is raised against the QUOTE, later claims against the JOB, so an
  // invoice belongs to this job either way. Filtering here rather than adding a
  // query keeps the money column something the operator can switch off.
  const related = invoices.filter(
    (invoice) => invoice.invoice.job_id === id || invoice.invoice.quote_id === row.quote.id,
  );

  return (
    <JobDetail
      row={row}
      variations={variations}
      attachments={attachments}
      invoices={related}
      depositEnabled={settings.deposit_enabled}
      depositPct={settings.deposit_pct}
    />
  );
}
