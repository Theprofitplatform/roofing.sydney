"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, PageHeader } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { money, moneyShort } from "@/lib/money";
import type { JobRow } from "@/lib/db/jobs";
import type { JobStatus } from "@/lib/db/types";
import { openJob } from "./actions";
import {
  JOB_PILL_CLASS,
  JOB_STATUSES,
  JOB_STATUS_LABEL,
  fmtDay,
  jobValueCents,
  matchesJob,
  sortJobs,
  type OpenableQuote,
} from "./job-view";

type Tab = "all" | JobStatus;

export function JobsList({ jobs, openable }: { jobs: JobRow[]; openable: OpenableQuote[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [term, setTerm] = useState("");
  const router = useRouter();

  const ordered = useMemo(() => sortJobs(jobs), [jobs]);

  const counts = useMemo(() => {
    const base: Record<Tab, number> = {
      all: ordered.length,
      scheduled: 0,
      in_progress: 0,
      on_hold: 0,
      complete: 0,
      cancelled: 0,
    };
    for (const row of ordered) base[row.job.status] += 1;
    return base;
  }, [ordered]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return ordered.filter(
      (row) => (tab === "all" || row.job.status === tab) && matchesJob(row, needle),
    );
  }, [ordered, tab, term]);

  return (
    <div className="stack-6">
      <PageHeader
        title="Jobs"
        description="Signed work, from the diary through to sign-off. Unscheduled jobs come first."
      />

      {openable.length > 0 && <ReadyToOpen quotes={openable} />}

      <div>
        <div className="list-controls">
          <div className="ftabs" role="tablist" aria-label="Filter jobs">
            <FilterTab id="all" label="All" active={tab} count={counts.all} onPick={setTab} />
            {JOB_STATUSES.map((status) => (
              <FilterTab
                key={status}
                id={status}
                label={JOB_STATUS_LABEL[status]}
                active={tab}
                count={counts[status]}
                onPick={setTab}
              />
            ))}
          </div>
          <div className="search">
            <Icon name="search" size={15} />
            <input
              placeholder="Search client, quote #, address…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search jobs"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={jobs.length === 0 ? "briefcase" : "file-search"}
              title={jobs.length === 0 ? "No jobs yet" : "Nothing here"}
            >
              {jobs.length === 0
                ? "A job opens against an accepted quote — it carries the scope and the price across so the crew works to what the client signed."
                : "Try a different client name, quote number, or address."}
            </EmptyState>
          </Card>
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Quote #</th>
                  <th>Client</th>
                  <th>Job / Property</th>
                  <th className="t-right" style={{ width: 120 }}>Value</th>
                  <th style={{ width: 170 }}>Scheduled</th>
                  <th style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.job.id} onClick={() => router.push(`/jobs/${row.job.id}`)}>
                    <td
                      className="mono"
                      data-label="Quote"
                      style={{ fontSize: 12.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
                    >
                      {row.quote.quote_number ?? "—"}
                    </td>
                    <td data-label="Client" style={{ fontWeight: 600 }}>
                      {row.client.name}
                    </td>
                    <td data-label="Job" className="cell-stack">
                      <div style={{ fontWeight: 500 }}>{row.quote.roof_type || "Roofing works"}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>
                        {row.client.property_address || ""}
                      </div>
                    </td>
                    <td className="num" data-label="Value" style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {money(jobValueCents(row.quote))}
                    </td>
                    <td data-label="Scheduled" className="cell-stack">
                      <ScheduleCell
                        start={row.job.scheduled_start}
                        end={row.job.scheduled_end}
                        status={row.job.status}
                      />
                    </td>
                    <td data-label="Status">
                      <span className={`pill ${JOB_PILL_CLASS[row.job.status]}`}>
                        {JOB_STATUS_LABEL[row.job.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterTab({
  id,
  label,
  active,
  count,
  onPick,
}: {
  id: Tab;
  label: string;
  active: Tab;
  count: number;
  onPick: (tab: Tab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active === id}
      className={`ftab ${active === id ? "is-active" : ""}`}
      onClick={() => onPick(id)}
    >
      {label}
      <span className="ftab__count">{count}</span>
    </button>
  );
}

function ScheduleCell({
  start,
  end,
  status,
}: {
  start: string | null;
  end: string | null;
  status: JobStatus;
}) {
  if (start || end) {
    return (
      <>
        <div className="mono" style={{ fontSize: 12 }}>{fmtDay(start)}</div>
        {end && end !== start && (
          <div className="mono" style={{ fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 2 }}>
            to {fmtDay(end)}
          </div>
        )}
      </>
    );
  }
  // Cancelled work is not waiting on a date, so it is not chased for one.
  if (status === "cancelled") return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  return <div className="nudge nudge--warning">no dates set</div>;
}

/**
 * Accepted quotes with no job. A signature is not yet work, and this is the only
 * screen that can tell the difference.
 */
function ReadyToOpen({ quotes }: { quotes: OpenableQuote[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const open = (quote: OpenableQuote) => {
    setBusyId(quote.quoteId);
    startTransition(async () => {
      const result = await openJob(quote.quoteId);
      setBusyId(null);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      toast(`Job opened for ${quote.quoteNumber ?? quote.clientName}`, "success", "briefcase");
      router.push(`/jobs/${result.jobId}`);
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Accepted, not yet a job</div>
          <div className="card-sub">
            {quotes.length === 1 ? "One quote has" : `${quotes.length} quotes have`} been signed with
            no job opened against them. Opening one carries the scope and the agreed price across.
          </div>
        </div>
      </div>

      {quotes.map((quote) => (
        <div className="snippet-row" key={quote.quoteId}>
          <div className="snippet-row__text">
            <div style={{ fontWeight: 600 }}>
              {quote.clientName}
              <span className="mono" style={{ marginLeft: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                {quote.quoteNumber ?? "—"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {quote.roofType || "Roofing works"}
              {quote.propertyAddress ? ` · ${quote.propertyAddress}` : ""} ·{" "}
              <span className="mono">{moneyShort(quote.valueCents)}</span>
            </div>
          </div>
          <div className="snippet-row__actions">
            <Button
              variant="brand"
              size="sm"
              icon="briefcase"
              disabled={pending}
              onClick={() => open(quote)}
            >
              {busyId === quote.quoteId ? "Opening…" : "Open a job"}
            </Button>
          </div>
        </div>
      ))}
    </Card>
  );
}
