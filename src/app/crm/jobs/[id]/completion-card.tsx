"use client";

import { useState, useTransition } from "react";
import { Button, Card, Field, Textarea } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import type { Job } from "@/lib/db/types";
import { changeStatus, signOffJob } from "../actions";
import { fmtMoment } from "../job-view";

export function CompletionCard({ job }: { job: Job }) {
  const complete = job.status === "complete";
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const signOff = () => {
    setConfirming(false);
    startTransition(async () => {
      const result = await signOffJob(job.id, notes);
      if (result.ok) {
        setNotes("");
        toast("Job signed off", "success", "check-circle");
      } else {
        toast(result.error, "error");
      }
    });
  };

  const reopen = () => {
    setReopening(false);
    startTransition(async () => {
      const result = await changeStatus(job.id, "in_progress");
      if (result.ok) toast("Job reopened", "info", "rotate-ccw");
      else toast(result.error, "error");
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Completion</div>
          <div className="card-sub">
            {complete
              ? "Signed off. The record below is what the job finished on."
              : "Sign the job off once the work is finished and the site is clear."}
          </div>
        </div>
      </div>

      {complete ? (
        <>
          <div className="meta-row">
            <span className="k">Signed off</span>
            <span className="v">{fmtMoment(job.completed_at)}</span>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Crew notes</div>
            <p
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                font: "400 13px/1.6 var(--font-sans)",
                color: job.crew_notes ? undefined : "var(--muted-foreground)",
              }}
            >
              {job.crew_notes || "No notes were left."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button variant="ghost" icon="rotate-ccw" disabled={pending} onClick={() => setReopening(true)}>
              Reopen job
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Crew notes"
            hint="What the crew found, what was done differently, anything the client should be told."
          >
            <Textarea
              rows={4}
              value={notes}
              disabled={pending || job.status === "cancelled"}
              placeholder="Ridge capping rebedded, two cracked tiles replaced, gutters flushed."
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          {job.status === "cancelled" && (
            <div className="inline-warn">
              <Icon name="ban" size={15} />
              A cancelled job cannot be signed off. Move it back to in progress first.
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <Button
              variant="brand"
              icon="check-circle"
              disabled={pending || job.status === "cancelled"}
              onClick={() => setConfirming(true)}
            >
              Sign off as complete
            </Button>
          </div>
        </>
      )}

      {confirming && (
        <Modal
          title="Sign this job off?"
          sub="The completion date is stamped once and does not move afterwards."
          maxWidth={460}
          onClose={() => setConfirming(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="brand" icon="check-circle" onClick={signOff}>
                Sign off
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, font: "400 13px/1.6 var(--font-sans)", color: "var(--muted-foreground)" }}>
            The job moves to complete and the crew notes below are kept with it.
            {notes.trim() ? "" : " You have not written any notes — that is fine, but they cannot be added silently later without another sign-off."}
          </p>
        </Modal>
      )}

      {reopening && (
        <Modal
          title="Reopen this job?"
          sub="Use this when the sign-off was premature — more work has surfaced on site."
          maxWidth={460}
          onClose={() => setReopening(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setReopening(false)}>Cancel</Button>
              <Button variant="danger" icon="rotate-ccw" onClick={reopen}>
                Reopen
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, font: "400 13px/1.6 var(--font-sans)", color: "var(--muted-foreground)" }}>
            The job goes back to in progress. The original sign-off date is kept and will not
            move when it is signed off again — if the extra work is chargeable, raise it as a
            variation rather than absorbing it here.
          </p>
        </Modal>
      )}
    </Card>
  );
}
