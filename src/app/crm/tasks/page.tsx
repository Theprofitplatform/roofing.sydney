import type { Metadata } from "next";
import { listClients } from "@/lib/db/clients";
import { listOpenTasks } from "@/lib/db/pipeline";
import { dayKey } from "../_workspace/dates";
import { toTaskRow } from "../_workspace/task-row";
import { TaskList } from "./task-list";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const [tasks, clients] = await Promise.all([listOpenTasks(), listClients()]);
  const today = dayKey();

  return (
    <TaskList
      tasks={tasks.map((task) => toTaskRow(task, today))}
      clients={clients.map((client) => ({ id: client.id, name: client.name }))}
      today={today}
    />
  );
}
