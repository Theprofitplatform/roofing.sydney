"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Modal } from "@/components/crm/modal";
import { Button, Card, EmptyState, IconButton, PageHeader } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { completeTask, removeTask, snoozeTask } from "./actions";
import { NewTaskModal, type ClientOption } from "./new-task";
import type { TaskRow } from "../_workspace/task-row";
import type { ActivityKind } from "@/lib/db/types";

const KIND_ICON: Record<ActivityKind, string> = {
  call: "phone",
  visit: "calendar",
  email: "mail",
  sms: "mail",
  task: "list-checks",
  note: "pen-line",
};

/** Snooze offsets an operator actually uses: tomorrow, later this week, next week. */
const SNOOZE = [
  { days: 1, label: "+1 day" },
  { days: 3, label: "+3 days" },
  { days: 7, label: "+1 week" },
];

type Filter = "all" | "overdue" | "today" | "upcoming";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
];

export function TaskList({
  tasks,
  clients,
  today,
}: {
  tasks: TaskRow[];
  clients: ClientOption[];
  today: string;
}) {
  const push = useToast();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [snoozing, setSnoozing] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);
  const [composing, setComposing] = useState(false);

  // A finished task should leave the list on the tap, not after a round trip.
  const [rows, dismiss] = useOptimistic(tasks, (state: TaskRow[], id: string) =>
    state.filter((task) => task.id !== id),
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      overdue: rows.filter((t) => t.bucket === "overdue").length,
      today: rows.filter((t) => t.bucket === "today").length,
      upcoming: rows.filter((t) => t.bucket === "upcoming").length,
    }),
    [rows],
  );

  const visible = filter === "all" ? rows : rows.filter((task) => task.bucket === filter);

  const done = (task: TaskRow) => {
    startTransition(async () => {
      dismiss(task.id);
      const result = await completeTask(task.id);
      if (result.ok) push("Task done", "success", "check-circle");
      else push(result.error, "error");
    });
  };

  const snooze = (task: TaskRow, days: number) => {
    setSnoozing(null);
    startTransition(async () => {
      const result = await snoozeTask(task.id, task.dueAt, days);
      if (result.ok) push(`Snoozed ${days === 7 ? "a week" : `${days} day${days > 1 ? "s" : ""}`}`, "info", "calendar");
      else push(result.error, "error");
    });
  };

  const drop = (task: TaskRow) => {
    setDeleting(null);
    startTransition(async () => {
      dismiss(task.id);
      const result = await removeTask(task.id);
      if (result.ok) push("Task deleted", "info", "trash-2");
      else push(result.error, "error");
    });
  };

  return (
    <div className="stack-6">
      <PageHeader
        title="Tasks"
        description="Everything with a date on it, soonest first. Overdue sits at the top because it should."
        actions={
          <Button variant="brand" icon="plus" onClick={() => setComposing(true)}>
            Log a task
          </Button>
        }
      />

      <div>
        <div className="list-controls">
          <div className="ftabs" role="tablist" aria-label="Filter tasks">
            {FILTERS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={filter === tab.id}
                className={`ftab ${filter === tab.id ? "is-active" : ""}`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
                <span className="ftab__count">{counts[tab.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={filter === "all" ? "list-checks" : "check-circle"}
              title={filter === "all" ? "Nothing scheduled" : "Nothing here"}
              actions={
                filter === "all" ? (
                  <Button variant="brand" icon="plus" onClick={() => setComposing(true)}>
                    Log a task
                  </Button>
                ) : undefined
              }
            >
              {filter === "overdue"
                ? "Nothing has been left to go cold."
                : filter === "today"
                  ? "Nothing is due today."
                  : filter === "upcoming"
                    ? "Nothing booked further out."
                    : "Give yourself something to chase — a callback, a site visit, a follow-up."}
            </EmptyState>
          </Card>
        ) : (
          <div className="table-wrap table-wrap--cards">
            <table className="table table--cards">
              <thead>
                <tr>
                  <th>Task</th>
                  <th style={{ width: 190 }}>Client</th>
                  <th style={{ width: 130 }}>Due</th>
                  <th style={{ width: 170 }} />
                </tr>
              </thead>
              <tbody>
                {visible.map((task) => (
                  <tr key={task.id} style={{ cursor: "default" }}>
                    <td data-label="Task" className="cell-stack">
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Icon
                          name={KIND_ICON[task.kind]}
                          size={14}
                          color="var(--muted-foreground)"
                        />
                        <span style={{ fontWeight: 600 }}>{task.body}</span>
                      </span>
                    </td>

                    <td data-label="Client" className="cell-stack">
                      {task.client ? (
                        <>
                          <div>
                            <Link
                              href={`/clients/${task.client.id}`}
                              style={{ color: "inherit", fontWeight: 500, textDecoration: "none" }}
                            >
                              {task.client.name}
                            </Link>
                          </div>
                          {task.client.phone && (
                            <div>
                              <a
                                href={`tel:${task.client.phone.replace(/\s+/g, "")}`}
                                className="mono"
                                style={{
                                  fontSize: 11.5,
                                  color: "var(--brand)",
                                  textDecoration: "none",
                                }}
                              >
                                {task.client.phone}
                              </a>
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>

                    <td data-label="Due" className="cell-stack">
                      <div className="mono" style={{ fontSize: 12 }}>
                        {task.dueLabel}
                      </div>
                      {task.bucket === "overdue" && (
                        <div className="nudge nudge--critical">overdue {task.overdueDays}d</div>
                      )}
                      {task.bucket === "today" && (
                        <div className="nudge nudge--warning">due today</div>
                      )}
                    </td>

                    <td className="t-right cell-action" data-label="">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Button
                          size="sm"
                          variant="outline"
                          icon="check-circle"
                          disabled={pending}
                          onClick={() => done(task)}
                        >
                          Done
                        </Button>
                        <IconButton
                          icon="calendar"
                          size={15}
                          title="Snooze"
                          disabled={pending}
                          onClick={() => setSnoozing(task)}
                        />
                        <IconButton
                          icon="trash-2"
                          size={15}
                          title="Delete task"
                          disabled={pending}
                          onClick={() => setDeleting(task)}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {composing && (
        <NewTaskModal clients={clients} today={today} onClose={() => setComposing(false)} />
      )}

      {snoozing && (
        <Modal
          title="Snooze this task"
          sub={snoozing.body}
          maxWidth={380}
          onClose={() => setSnoozing(null)}
          footer={
            <Button variant="ghost" onClick={() => setSnoozing(null)}>
              Cancel
            </Button>
          }
        >
          <p style={{ margin: "0 0 12px", color: "var(--muted-foreground)" }}>
            Counted from today, or from the due date if it is still ahead — snoozing
            never drags a task forward.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {SNOOZE.map((option) => (
              <Button
                key={option.days}
                variant="outline"
                icon="calendar"
                onClick={() => snooze(snoozing, option.days)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete this task?"
          sub={deleting.body}
          maxWidth={420}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" icon="trash-2" onClick={() => drop(deleting)}>
                Delete task
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            It disappears from the record entirely. If the work simply is not happening
            yet, snooze it instead — that keeps the history honest.
          </p>
        </Modal>
      )}
    </div>
  );
}
