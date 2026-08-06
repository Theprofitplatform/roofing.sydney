"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Input } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import type { Job, JobStatus } from "@/lib/db/types";
import { changeStatus, saveSchedule } from "../actions";
import { JOB_STATUS_LABEL } from "../job-view";

/**
 * Completion is deliberately absent from this control.
 *
 * `setJobStatus` would move the row to `complete` without stamping
 * `completed_at`, leaving a finished job with no record of when it finished.
 * Signing off is the only way there, and it lives in its own card.
 */
const SETTABLE: readonly JobStatus[] = ["scheduled", "in_progress", "on_hold", "cancelled"];

export function ScheduleCard({ job }: { job: Job }) {
  const [start, setStart] = useState(job.scheduled_start ?? "");
  const [end, setEnd] = useState(job.scheduled_end ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const dirty = start !== (job.scheduled_start ?? "") || end !== (job.scheduled_end ?? "");

  // `jobs_dates_ordered` rejects this at the database. Saying so before the
  // round trip means the operator corrects a typo rather than reads a refusal.
  const outOfOrder = Boolean(start && end && end < start);

  const save = () => {
    startTransition(async () => {
      const result = await saveSchedule(job.id, start, end);
      if (result.ok) toast("Schedule saved", "success", "calendar");
      else toast(result.error, "error");
    });
  };

  const setStatus = (status: JobStatus) => {
    if (status === job.status) return;
    startTransition(async () => {
      const result = await changeStatus(job.id, status);
      if (result.ok) toast(`Marked ${JOB_STATUS_LABEL[status].toLowerCase()}`, "success", "briefcase");
      else toast(result.error, "error");
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Schedule</div>
          <div className="card-sub">
            When the crew is on site, and where the job sits right now.
          </div>
        </div>
        {dirty && !pending && <span className="save-state is-dirty">Unsaved</span>}
        {pending && <span className="save-state is-saving">Saving…</span>}
      </div>

      <div className="section-label" style={{ marginBottom: 8 }}>Status</div>
      <div className="seg" role="group" aria-label="Job status">
        {SETTABLE.map((status) => (
          <button
            key={status}
            type="button"
            className={`seg__btn ${job.status === status ? "is-active" : ""}`}
            aria-pressed={job.status === status}
            disabled={pending || job.status === "complete"}
            onClick={() => setStatus(status)}
          >
            {JOB_STATUS_LABEL[status]}
          </button>
        ))}
      </div>
      {job.status === "complete" && (
        <div className="inline-warn">
          <Icon name="check-circle" size={15} />
          This job has been signed off. Raise a variation if more work is needed.
        </div>
      )}

      <div className="grid-2" style={{ marginTop: 18 }}>
        <Field label="Start">
          <Input
            type="date"
            value={start}
            max={end || undefined}
            disabled={pending}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Finish">
          <Input
            type="date"
            value={end}
            min={start || undefined}
            disabled={pending}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>

      {outOfOrder && (
        <div className="inline-warn">
          <Icon name="alert-triangle" size={15} />
          The finish date falls before the start date.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button
          variant="brand"
          icon="save"
          disabled={pending || outOfOrder || !dirty}
          onClick={save}
        >
          Save schedule
        </Button>
        {dirty && !pending && (
          <Button
            variant="ghost"
            onClick={() => {
              setStart(job.scheduled_start ?? "");
              setEnd(job.scheduled_end ?? "");
            }}
          >
            Discard
          </Button>
        )}
      </div>
    </Card>
  );
}
