"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Field, IconButton, Input, Select } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import type { AttachmentKind, JobAttachment } from "@/lib/db/types";
import { removeAttachment } from "../attachment-actions";
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_KIND_ICON,
  ATTACHMENT_KIND_LABEL,
  MAX_ATTACHMENT_BYTES,
  fmtBytes,
  fmtMoment,
} from "../job-view";

/**
 * Job paperwork — an engineer's report, a colour sheet, a warranty certificate.
 * Not site photos: those belong to the quote, where the client sees them. What
 * lands here is the record that has to outlive the crew's phone.
 */
export function AttachmentsCard({
  jobId,
  attachments,
}: {
  jobId: string;
  attachments: JobAttachment[];
}) {
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const removing = attachments.find((a) => a.id === removingId) ?? null;

  const confirmRemove = () => {
    if (!removing) return;
    setRemovingId(null);
    startTransition(async () => {
      const result = await removeAttachment(jobId, removing.id);
      if (result.ok) toast("Attachment removed", "info", "trash-2");
      else toast(result.error, "error");
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Attachments</div>
          <div className="card-sub">
            Reports, colour sheets and warranties kept with the job rather than in an inbox.
          </div>
        </div>
        <Button variant="outline" size="sm" icon="upload" onClick={() => setAdding(true)}>
          Attach a file
        </Button>
      </div>

      {attachments.length === 0 ? (
        <EmptyState icon="paperclip" title="Nothing attached">
          Engineer&rsquo;s reports, colour selections and warranty certificates belong here — they
          are what you reach for when a question comes back two years later.
        </EmptyState>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {attachments.map((file) => (
            <div className="attach" key={file.id}>
              <span className="attach__icon">
                <Icon name={ATTACHMENT_KIND_ICON[file.kind] ?? "paperclip"} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="attach__name">{file.filename || "Untitled file"}</div>
                <div className="attach__size">
                  {ATTACHMENT_KIND_LABEL[file.kind] ?? "Other"} · {fmtMoment(file.created_at)}
                </div>
                {file.caption && (
                  <div
                    style={{
                      marginTop: 5,
                      font: "400 12px/1.45 var(--font-sans)",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {file.caption}
                  </div>
                )}
              </div>
              <div style={{ display: "inline-flex", gap: 2, flexShrink: 0 }}>
                <a
                  className="icon-btn"
                  href={`/jobs/${jobId}/attachments/${file.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Download ${file.filename ?? "file"}`}
                  aria-label={`Download ${file.filename ?? "file"}`}
                >
                  <Icon name="download" size={16} />
                </a>
                <IconButton
                  icon="trash-2"
                  size={15}
                  title="Remove attachment"
                  disabled={pending}
                  onClick={() => setRemovingId(file.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <UploadModal
          jobId={jobId}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            // The upload runs through a route handler, so nothing has told the
            // router the page is stale.
            router.refresh();
          }}
        />
      )}

      {removing && (
        <Modal
          title="Remove this attachment?"
          sub={removing.filename ?? undefined}
          maxWidth={440}
          onClose={() => setRemovingId(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRemovingId(null)}>Cancel</Button>
              <Button variant="danger" icon="trash-2" onClick={confirmRemove}>Remove</Button>
            </>
          }
        >
          <p style={{ margin: 0, font: "400 13px/1.6 var(--font-sans)", color: "var(--muted-foreground)" }}>
            The file is deleted from storage as well. If it is the only copy of a warranty or an
            engineer&rsquo;s report, download it first.
          </p>
        </Modal>
      )}
    </Card>
  );
}

function UploadModal({
  jobId,
  onClose,
  onDone,
}: {
  jobId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<AttachmentKind>("engineer_report");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a file to attach.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError(`That file is over ${fmtBytes(MAX_ATTACHMENT_BYTES)} — too large to attach.`);
      return;
    }

    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    body.set("caption", caption);

    try {
      const response = await fetch(`/jobs/${jobId}/attachments`, { method: "POST", body });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "The upload failed. Try again.");
        setBusy(false);
        return;
      }
      toast(`${file.name} attached`, "success", "paperclip");
      onDone();
    } catch {
      setBusy(false);
      setError("The upload could not reach the server. Check your connection and try again.");
    }
  };

  return (
    <Modal
      title="Attach a file"
      sub={`Up to ${fmtBytes(MAX_ATTACHMENT_BYTES)}. Stored privately — links are signed and expire.`}
      maxWidth={520}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="brand" icon="upload" disabled={busy} onClick={upload}>
            {busy ? "Uploading…" : "Attach"}
          </Button>
        </>
      }
    >
      <Field label="File" required>
        <input ref={fileRef} className="input" type="file" onChange={() => setError(null)} />
      </Field>

      <Field label="What is it" style={{ marginTop: 12 }}>
        <Select value={kind} onChange={(e) => setKind(e.target.value as AttachmentKind)}>
          {ATTACHMENT_KINDS.map((option) => (
            <option key={option} value={option}>
              {ATTACHMENT_KIND_LABEL[option]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Caption" hint="Optional — what it covers, or who issued it." style={{ marginTop: 12 }}>
        <Input
          value={caption}
          placeholder="Structural sign-off for the eastern valley re-batten"
          onChange={(e) => setCaption(e.target.value)}
        />
      </Field>

      {error && (
        <div className="inline-warn">
          <Icon name="alert-triangle" size={15} />
          {error}
        </div>
      )}
    </Modal>
  );
}
