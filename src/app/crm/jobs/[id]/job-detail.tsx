"use client";

import Link from "next/link";
import { Card, PageHeader } from "@/components/crm/ui";
import { money } from "@/lib/money";
import type { InvoiceRow } from "@/lib/db/invoices";
import type { JobRow, VariationRow } from "@/lib/db/jobs";
import type { JobAttachment } from "@/lib/db/types";
import { AttachmentsCard } from "./attachments-card";
import { CompletionCard } from "./completion-card";
import { MoneyCard } from "./money-card";
import { ScheduleCard } from "./schedule-card";
import { VariationsCard } from "./variations-card";
import {
  JOB_PILL_CLASS,
  JOB_STATUS_LABEL,
  fmtDay,
  fmtMoment,
  fmtSchedule,
  jobValueCents,
} from "../job-view";

export function JobDetail({
  row,
  variations,
  attachments,
  invoices,
  depositEnabled,
  depositPct,
}: {
  row: JobRow;
  variations: VariationRow[];
  attachments: JobAttachment[];
  invoices: InvoiceRow[];
  depositEnabled: boolean;
  depositPct: number;
}) {
  const { job, quote, client } = row;
  const valueCents = jobValueCents(quote);

  return (
    <div className="stack-6">
      <PageHeader
        crumbs={[{ label: "Jobs", href: "/jobs" }, { label: quote.quote_number ?? "Job" }]}
        title={client.name}
        description={
          <>
            {quote.roof_type || "Roofing works"}
            {client.property_address ? ` · ${client.property_address}` : ""}
          </>
        }
        actions={
          <span className={`pill ${JOB_PILL_CLASS[job.status]}`}>
            {JOB_STATUS_LABEL[job.status]}
          </span>
        }
      />

      <div className="qview">
        <div className="qview__rail">
          <Card padding>
            <div className="card-head">
              <div className="card-title">Job</div>
            </div>

            <div className="meta-row">
              <span className="k">Quote</span>
              <span className="v">
                <Link href={`/quotes/${quote.id}`} className="mono">
                  {quote.quote_number ?? "Draft"}
                </Link>
              </span>
            </div>
            <div className="meta-row">
              <span className="k">Client</span>
              <span className="v">
                <Link href={`/clients/${client.id}`}>{client.name}</Link>
              </span>
            </div>
            {client.phone && (
              <div className="meta-row">
                <span className="k">Phone</span>
                <span className="v mono">{client.phone}</span>
              </div>
            )}
            {client.property_address && (
              <div className="meta-row">
                <span className="k">Property</span>
                <span className="v" style={{ whiteSpace: "normal", textAlign: "right" }}>
                  {client.property_address}
                </span>
              </div>
            )}
            <div className="meta-row">
              <span className="k">Roof type</span>
              <span className="v">{quote.roof_type || "—"}</span>
            </div>
            <div className="meta-row">
              <span className="k">Scheduled</span>
              <span className="v">{fmtSchedule(job.scheduled_start, job.scheduled_end)}</span>
            </div>
            <div className="meta-row">
              <span className="k">Value</span>
              <span className="v mono">{money(valueCents)}</span>
            </div>

            <div style={{ marginTop: 18 }}>
              <JobTimeline
                openedAt={job.created_at}
                scheduledStart={job.scheduled_start}
                completedAt={job.completed_at}
              />
            </div>
          </Card>

          <MoneyCard
            jobId={job.id}
            quoteId={quote.id}
            valueCents={valueCents}
            invoices={invoices}
            depositEnabled={depositEnabled}
            depositPct={depositPct}
          />
        </div>

        <div className="qview__main">
          <div className="stack-6">
            <ScheduleCard job={job} />
            <CompletionCard job={job} />
            <VariationsCard jobId={job.id} variations={variations} />
            <AttachmentsCard jobId={job.id} attachments={attachments} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The three moments that matter on a job. Scheduling is shown as done once a
 * start date exists, not once that date has passed — the decision is what the
 * step records, and the diary entry is the decision.
 */
function JobTimeline({
  openedAt,
  scheduledStart,
  completedAt,
}: {
  openedAt: string;
  scheduledStart: string | null;
  completedAt: string | null;
}) {
  const steps = [
    { label: "Job opened", date: fmtMoment(openedAt), done: true },
    {
      label: "Scheduled",
      date: scheduledStart ? fmtDay(scheduledStart) : "Not scheduled",
      done: Boolean(scheduledStart),
    },
    {
      label: "Signed off",
      date: completedAt ? fmtMoment(completedAt) : "Not complete",
      done: Boolean(completedAt),
    },
  ];

  return (
    <div className="timeline">
      {steps.map((step, i) => (
        <div
          key={step.label}
          className={`timeline__step ${step.done ? "is-done" : ""} ${
            i === steps.length - 1 ? "is-last" : ""
          }`}
        >
          <span className="timeline__dot" />
          <div className="timeline__body">
            <div className="timeline__label">{step.label}</div>
            <div className="timeline__date">{step.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
