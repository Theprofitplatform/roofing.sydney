"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/crm/modal";
import { Button, Field, Input, Select, Textarea } from "@/components/crm/ui";
import { useToast } from "@/components/crm/toast";
import { createTask } from "./actions";
import type { ActivityKind } from "@/lib/db/types";

export interface ClientOption {
  id: string;
  name: string;
}

/** Only the kinds you would ever schedule. A note has nothing to be due. */
const KINDS: { id: ActivityKind; label: string }[] = [
  { id: "call", label: "Call" },
  { id: "visit", label: "Site visit" },
  { id: "email", label: "Email" },
  { id: "task", label: "Other task" },
];

export function NewTaskModal({
  clients,
  today,
  onClose,
}: {
  clients: ClientOption[];
  /** YYYY-MM-DD in business time — the sensible default for "chase this". */
  today: string;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ActivityKind>("call");
  const [body, setBody] = useState("");
  const [clientId, setClientId] = useState("");
  const [dueAt, setDueAt] = useState(today);
  const [pending, startTransition] = useTransition();
  const push = useToast();

  const save = () => {
    startTransition(async () => {
      const result = await createTask({ kind, body, dueAt, clientId: clientId || null });
      if (result.ok) {
        push("Task logged", "success", "list-checks");
        onClose();
      } else {
        push(result.error, "error");
      }
    });
  };

  return (
    <Modal
      title="Log a task"
      sub="Anything with a date on it lands on this screen and on the dashboard."
      maxWidth={460}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="brand" icon="plus" onClick={save} disabled={pending || !body.trim()}>
            Add task
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="What needs doing" required>
          <Textarea
            value={body}
            rows={3}
            placeholder="Ring back about the ridge capping quote…"
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>

        <div className="grid-2">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due" required>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </Field>
        </div>

        <Field label="Client" hint="Optional — links the task to their history and phone number.">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
