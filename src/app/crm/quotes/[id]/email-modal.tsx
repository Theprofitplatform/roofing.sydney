"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import { Button, Field, Input, Textarea } from "@/components/crm/ui";

/**
 * Compose window for anything that leaves the building.
 *
 * The operator sees and edits exactly what the client will read. `subjectEdited`
 * is reported back because a draft has no quote number yet — an untouched
 * default subject is recomposed server-side once the number is drawn, and one
 * the operator wrote is sent verbatim.
 */
export function EmailModal({
  title,
  sub,
  to,
  initialSubject,
  initialBody,
  attachmentName,
  note,
  sendLabel,
  onClose,
  onSend,
}: {
  title: string;
  sub: string;
  to: string;
  initialSubject: string;
  initialBody: string;
  attachmentName: string | null;
  note?: ReactNode;
  sendLabel: string;
  onClose: () => void;
  onSend: (input: { subject: string; body: string; subjectEdited: boolean }) => Promise<void>;
}) {
  const toast = useToast();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    await onSend({ subject, body, subjectEdited: subject !== initialSubject });
    setSending(false);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
      toast("Email text copied to clipboard", "success", "check-circle");
    } catch {
      toast("Couldn't copy — select and copy manually", "warning");
    }
  };

  return (
    <Modal
      title={title}
      sub={sub}
      onClose={sending ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" icon="clipboard" disabled={sending} onClick={() => void copyText()}>
            Copy text
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button
            variant="brand"
            icon={sending ? "loader-2" : "send"}
            className={sending ? "is-spinning" : ""}
            disabled={sending}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : sendLabel}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="To">
          <Input value={to} readOnly />
        </Field>
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea
            style={{ minHeight: 168, lineHeight: 1.55 }}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>

        {attachmentName && (
          <div className="attach">
            <span className="attach__icon">
              <Icon name="file-text" size={17} />
            </span>
            <div style={{ flex: 1 }}>
              <div className="attach__name">{attachmentName}</div>
              <div className="attach__size">Branded quote · A4 · auto-attached</div>
            </div>
            <Icon name="paperclip" size={15} color="var(--muted-foreground)" />
          </div>
        )}

        {note && (
          <p style={{ margin: 0, color: "var(--muted-foreground)", font: "400 12px/1.5 var(--font-sans)" }}>
            {note}
          </p>
        )}
      </div>
    </Modal>
  );
}
