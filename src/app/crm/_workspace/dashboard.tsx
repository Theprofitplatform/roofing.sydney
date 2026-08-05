"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Button, Card, EmptyState, PageHeader } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { completeTask, logFollowUp } from "../tasks/actions";
import type { TaskRow } from "./task-row";

export interface Kpi {
  icon: string;
  label: string;
  value: string;
  sub: string;
  warn?: boolean;
}

export interface AttentionRow {
  quoteId: string;
  quoteNumber: string;
  clientId: string | null;
  clientName: string;
  subject: string | null;
  valueLabel: string;
  nudge: string;
  level: "critical" | "warning";
}

export interface MovementRow {
  id: string;
  clientId: string;
  clientName: string;
  stageLabel: string;
  /** A `pill--*` modifier from the CRM stylesheet. */
  stageTone: string;
  whenLabel: string;
}

/**
 * The stylesheet carries no anchor reset, so a `<Link>` styled as a button or a
 * table cell arrives underlined. Every link on this screen opts out explicitly.
 */
const LINK: React.CSSProperties = { textDecoration: "none" };

function KpiTile({ icon, label, value, sub, warn }: Kpi) {
  return (
    <div className="card" style={{ padding: "15px 17px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          font: "600 11.5px/1 var(--font-sans)",
          color: "var(--muted-foreground)",
        }}
      >
        <Icon name={icon} size={14} /> {label}
      </div>
      <div
        className="tabular-nums"
        style={{
          marginTop: 8,
          font: "700 24px/1.2 var(--font-sans)",
          letterSpacing: "-0.01em",
          color: warn ? "var(--status-warning)" : undefined,
        }}
      >
        {value}
      </div>
      <div
        style={{
          marginTop: 5,
          font: "400 11.5px/1.3 var(--font-sans)",
          color: "var(--muted-foreground)",
        }}
      >
        {sub}
      </div>
    </div>
  );
}

export function Dashboard({
  kpis,
  attention,
  tasks,
  movement,
}: {
  kpis: Kpi[];
  attention: AttentionRow[];
  tasks: TaskRow[];
  movement: MovementRow[];
}) {
  const push = useToast();
  const [pending, startTransition] = useTransition();
  const [chased, setChased] = useState<string[]>([]);
  const [openTasks, dismiss] = useOptimistic(tasks, (state: TaskRow[], id: string) =>
    state.filter((task) => task.id !== id),
  );

  const followUp = (row: AttentionRow) => {
    startTransition(async () => {
      const result = await logFollowUp(
        row.quoteId,
        row.clientId,
        `Follow up ${row.clientName} on ${row.quoteNumber} — ${row.nudge}`,
      );
      if (result.ok) {
        setChased((current) => [...current, row.quoteId]);
        push("Added to today's tasks", "success", "list-checks");
      } else {
        push(result.error, "error");
      }
    });
  };

  const done = (task: TaskRow) => {
    startTransition(async () => {
      dismiss(task.id);
      const result = await completeTask(task.id);
      if (result.ok) push("Task done", "success", "check-circle");
      else push(result.error, "error");
    });
  };

  return (
    <div className="stack-6">
      <PageHeader title="Dashboard" description="What needs you today, and what moved." />

      <div
        className="kpi-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14,
        }}
      >
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} {...kpi} />
        ))}
      </div>

      <div
        className="dash-cols"
        style={{
          display: "grid",
          gridTemplateColumns: "1.35fr 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        <Card padding>
          <div className="card-head">
            <div>
              <div className="card-title">Needs attention</div>
              <div className="card-sub">Quotes gone quiet, expiring, or already past their date.</div>
            </div>
            <Link className="btn btn--ghost btn--sm" href="/quotes" style={LINK}>
              All quotes
            </Link>
          </div>

          {attention.length === 0 ? (
            <EmptyState icon="check-circle" title="Nothing is going stale">
              Every issued quote is either fresh or already decided.
            </EmptyState>
          ) : (
            attention.map((row) => (
              <div key={row.quoteId} className="snippet-row">
                <div className="snippet-row__text">
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--muted-foreground)" }}>
                      {row.quoteNumber}
                    </span>
                    <span style={{ font: "600 13px/1.3 var(--font-sans)" }}>{row.clientName}</span>
                    <span className="mono" style={{ fontSize: 12, marginLeft: "auto" }}>
                      {row.valueLabel}
                    </span>
                  </div>
                  {row.subject && (
                    <div
                      style={{
                        marginTop: 2,
                        font: "400 11.5px/1.4 var(--font-sans)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {row.subject}
                    </div>
                  )}
                  <div className={`nudge nudge--${row.level}`}>{row.nudge}</div>
                </div>

                <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                  <Link className="btn btn--outline btn--sm" href={`/quotes/${row.quoteId}`} style={LINK}>
                    Open
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={chased.includes(row.quoteId) ? "check-circle" : "bell"}
                    disabled={pending || chased.includes(row.quoteId)}
                    onClick={() => followUp(row)}
                  >
                    {chased.includes(row.quoteId) ? "Chasing" : "Chase"}
                  </Button>
                </span>
              </div>
            ))
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Today and overdue</div>
                <div className="card-sub">The work you promised someone.</div>
              </div>
              <Link className="btn btn--ghost btn--sm" href="/tasks" style={LINK}>
                All tasks
              </Link>
            </div>

            {openTasks.length === 0 ? (
              <EmptyState icon="list-checks" title="Nothing due">
                Nothing is overdue and nothing is booked for today.
              </EmptyState>
            ) : (
              openTasks.map((task) => (
                <div key={task.id} className="snippet-row">
                  <div className="snippet-row__text">
                    <div style={{ font: "500 12.5px/1.4 var(--font-sans)" }}>{task.body}</div>
                    <div
                      style={{
                        marginTop: 3,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {task.client && (
                        <Link
                          href={`/clients/${task.client.id}`}
                          style={{ ...LINK, font: "500 11.5px/1.3 var(--font-sans)", color: "inherit" }}
                        >
                          {task.client.name}
                        </Link>
                      )}
                      {task.client?.phone && (
                        <a
                          href={`tel:${task.client.phone.replace(/\s+/g, "")}`}
                          className="mono"
                          style={{ ...LINK, fontSize: 11, color: "var(--brand)" }}
                        >
                          {task.client.phone}
                        </a>
                      )}
                      <span
                        className={
                          task.bucket === "overdue" ? "nudge nudge--critical" : "nudge nudge--warning"
                        }
                        style={{ marginTop: 0 }}
                      >
                        {task.bucket === "overdue" ? `overdue ${task.overdueDays}d` : "due today"}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    icon="check-circle"
                    disabled={pending}
                    onClick={() => done(task)}
                  >
                    Done
                  </Button>
                </div>
              ))
            )}
          </Card>

          <Card padding>
            <div className="card-head">
              <div>
                <div className="card-title">Recent movement</div>
                <div className="card-sub">Last cards to change hands.</div>
              </div>
              <Link className="btn btn--ghost btn--sm" href="/pipeline" style={LINK}>
                Pipeline
              </Link>
            </div>

            {movement.length === 0 ? (
              <EmptyState icon="kanban" title="Nothing has moved">
                Enquiries from roofing.sydney land on the board automatically.
              </EmptyState>
            ) : (
              movement.map((row) => (
                <div key={row.id} className="snippet-row">
                  <div className="snippet-row__text">
                    <Link
                      href={`/clients/${row.clientId}`}
                      style={{ ...LINK, font: "600 12.5px/1.3 var(--font-sans)", color: "inherit" }}
                    >
                      {row.clientName}
                    </Link>
                    <div style={{ marginTop: 5 }}>
                      <span className={`pill pill--${row.stageTone}`}>{row.stageLabel}</span>
                    </div>
                  </div>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
                  >
                    {row.whenLabel}
                  </span>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
