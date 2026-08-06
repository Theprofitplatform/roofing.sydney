"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import {
  Button,
  Card,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from "@/components/crm/ui";
import type { Activity, ActivityKind } from "@/lib/db/types";
import {
  completeActivityAction,
  deleteActivityAction,
  logActivityAction,
} from "../actions";
import { daysUntil, dueAtFromDay, dueLabel, fmtDay, fmtMoment } from "../dates";

/**
 * Every call, email, visit and note against one client, newest first.
 *
 * Contact log and task list are one table, so they are one stream here too —
 * splitting them on screen would hide the thing that makes the history useful:
 * that the note about a leaking valley and the task to ring back about it sit
 * next to each other in time.
 */
interface KindStyle {
  label: string;
  icon: string;
  /** Dot colour. Tasks read as brand work; contact reads as record. */
  tone: string;
}

const KIND: Record<ActivityKind, KindStyle> = {
  note: { label: "Note", icon: "clipboard", tone: "var(--muted-foreground)" },
  call: { label: "Call", icon: "phone", tone: "var(--brand)" },
  email: { label: "Email", icon: "mail", tone: "var(--brand)" },
  sms: { label: "SMS", icon: "send", tone: "var(--brand)" },
  visit: { label: "Site visit", icon: "building-2", tone: "var(--status-success)" },
  task: { label: "Task", icon: "list-checks", tone: "var(--status-warning)" },
};

const KINDS = Object.keys(KIND) as ActivityKind[];

export function ActivityTimeline({
  clientId,
  activities,
}: {
  clientId: string;
  activities: Activity[];
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ActivityKind>("call");
  const [body, setBody] = useState("");
  const [due, setDue] = useState("");

  const log = () => {
    if (!body.trim() || pending) return;
    startTransition(async () => {
      const result = await logActivityAction({
        kind,
        body,
        client_id: clientId,
        due_at: due ? dueAtFromDay(due) : null,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setBody("");
      setDue("");
      toast(kind === "task" ? "Task added" : "Logged", "success", KIND[kind].icon);
    });
  };

  const complete = (id: string) =>
    startTransition(async () => {
      const result = await completeActivityAction(id, clientId);
      if (result.ok) toast("Marked done", "success", "check-circle");
      else toast(result.error, "error");
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteActivityAction(id, clientId);
      if (result.ok) toast("Entry removed", "info", "trash-2");
      else toast(result.error, "error");
    });

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">History</div>
          <div className="card-sub">
            Calls, emails, visits and tasks against this client — newest first.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 14,
          marginBottom: 18,
          background: "var(--fill-1)",
          border: "1px dashed var(--border)",
          borderRadius: 10,
        }}
      >
        <div className="grid-2">
          <Field label="What happened">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND[k].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label={kind === "task" ? "Due date" : "Follow up on (optional)"}
            hint={kind === "task" ? "A task with no date never surfaces" : undefined}
          >
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <Field label="Detail">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              kind === "task"
                ? "e.g. Ring back about the valley flashing quote"
                : "e.g. Spoke to Sarah — wants the gutter guard priced separately"
            }
            style={{ minHeight: 78 }}
          />
        </Field>
        <div>
          <Button
            variant="brand"
            size="sm"
            icon="plus"
            onClick={log}
            disabled={pending || !body.trim()}
          >
            {kind === "task" ? "Add task" : "Log it"}
          </Button>
        </div>
      </div>

      {activities.length === 0 ? (
        <div
          style={{
            padding: "10px 0",
            font: "400 13px/1.4 var(--font-sans)",
            color: "var(--muted-foreground)",
          }}
        >
          Nothing logged yet. The first call you take is worth writing down.
        </div>
      ) : (
        <div className="timeline">
          {activities.map((activity, index) => {
            const style = KIND[activity.kind] ?? KIND.note;
            const isOpenTask = !!activity.due_at && !activity.done_at;
            return (
              <div
                key={activity.id}
                className={`timeline__step ${activity.done_at ? "is-done" : ""} ${
                  index === activities.length - 1 ? "is-last" : ""
                }`}
              >
                <span className="timeline__dot" style={{ color: style.tone }}>
                  <Icon name={style.icon} size={12} />
                </span>
                <div className="timeline__body">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="timeline__label">{style.label}</span>
                    <span className="timeline__date">{fmtMoment(activity.created_at)}</span>
                    <span style={{ flex: 1 }} />
                    <IconButton
                      icon="trash-2"
                      size={13}
                      title="Remove this entry"
                      onClick={() => remove(activity.id)}
                      disabled={pending}
                    />
                  </div>

                  {activity.body && (
                    <p
                      style={{
                        margin: "3px 0 0",
                        font: "400 13px/1.5 var(--font-sans)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {activity.body}
                    </p>
                  )}

                  {isOpenTask && activity.due_at && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        marginTop: 7,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Severity comes from the same day count as the label:
                          comparing instants instead painted a red "overdue"
                          badge around the words "Due today". */}
                      <span
                        className={`nudge ${
                          daysUntil(activity.due_at) < 0 ? "nudge--critical" : "nudge--warning"
                        }`}
                        style={{ marginTop: 0 }}
                      >
                        {dueLabel(activity.due_at)} · {fmtDay(activity.due_at)}
                      </span>
                      <Button
                        variant="subtle"
                        size="sm"
                        icon="check"
                        onClick={() => complete(activity.id)}
                        disabled={pending}
                      >
                        Done
                      </Button>
                    </div>
                  )}

                  {activity.done_at && (
                    <div className="timeline__date" style={{ marginTop: 5 }}>
                      Completed {fmtMoment(activity.done_at)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
