import { bucketFor, dayDiff, dayKey, formatDay, type DueBucket } from "./dates";
import type { ActivityKind } from "@/lib/db/types";
import type { OpenTask } from "@/lib/db/pipeline";

/**
 * A task as the screens render it. Both /tasks and the dashboard show the same
 * row, and both need the bucketing done in business time rather than the
 * container's — so it happens once, here, on the server.
 */
export interface TaskRow {
  id: string;
  kind: ActivityKind;
  body: string;
  /** Kept raw so a snooze can measure from the date the task was already due. */
  dueAt: string;
  dueLabel: string;
  bucket: DueBucket;
  /** Whole days late. Zero unless the task is overdue. */
  overdueDays: number;
  client: { id: string; name: string; phone: string | null } | null;
}

export function toTaskRow(task: OpenTask, today = dayKey()): TaskRow {
  // listOpenTasks selects on `due_at is not null`, so the column is only nullable
  // in the type, never in a row that reaches here.
  const dueAt = task.activity.due_at as string;
  const bucket = bucketFor(dueAt, today);

  return {
    id: task.activity.id,
    kind: task.activity.kind,
    body: task.activity.body?.trim() || "Untitled task",
    dueAt,
    dueLabel: formatDay(dueAt),
    bucket,
    overdueDays: bucket === "overdue" ? dayDiff(dayKey(dueAt), today) : 0,
    client: task.client,
  };
}
