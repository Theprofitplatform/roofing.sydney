"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/crm/toast";
import { Button, Card, Checkbox, IconButton, Input } from "@/components/crm/ui";
import type { ClauseKind, Snippet } from "@/lib/db/types";
import {
  createSnippetAction,
  deleteSnippetAction,
  updateSnippetAction,
} from "./actions";

const HEADING: Record<ClauseKind, { title: string; sub: string; placeholder: string }> = {
  inclusion: {
    title: "Inclusions",
    sub: "What the price covers. Default-ticked clauses pre-fill every new quote.",
    placeholder: "e.g. Removal and disposal of all roofing waste",
  },
  exclusion: {
    title: "Exclusions",
    sub: "What the price does not cover. This is the wording that prevents an argument later.",
    placeholder: "e.g. Rotten timber or structural repairs — quoted as a variation",
  },
};

export function ClausesTab({ snippets }: { snippets: Snippet[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ClauseList kind="inclusion" snippets={snippets} />
      <ClauseList kind="exclusion" snippets={snippets} />
    </div>
  );
}

function ClauseList({ kind, snippets }: { kind: ClauseKind; snippets: Snippet[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const list = snippets.filter((s) => s.kind === kind);
  const heading = HEADING[kind];

  const add = () => {
    if (!draft.trim() || pending) return;
    startTransition(async () => {
      const result = await createSnippetAction(kind, draft);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setDraft("");
      setAdding(false);
      toast("Clause added", "success", "check-circle");
    });
  };

  const saveEdit = (id: string) => {
    if (!editText.trim() || pending) return;
    startTransition(async () => {
      const result = await updateSnippetAction(id, { text: editText });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setEditingId(null);
      toast("Clause updated", "success", "check-circle");
    });
  };

  const toggleDefault = (snippet: Snippet) =>
    startTransition(async () => {
      const result = await updateSnippetAction(snippet.id, { is_default: !snippet.is_default });
      if (!result.ok) toast(result.error, "error");
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteSnippetAction(id);
      if (result.ok) toast("Clause deleted", "info", "trash-2");
      else toast(result.error, "error");
    });

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">{heading.title}</div>
          <div className="card-sub">{heading.sub}</div>
        </div>
        <Button
          variant="subtle"
          size="sm"
          icon="plus"
          onClick={() => {
            setAdding(true);
            setDraft("");
          }}
        >
          Add
        </Button>
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Input
            autoFocus
            placeholder={heading.placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button variant="brand" size="sm" onClick={add} disabled={pending || !draft.trim()}>
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      )}

      <div>
        {list.map((snippet) => (
          <div className="snippet-row" key={snippet.id}>
            {editingId === snippet.id ? (
              <Input
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEdit(snippet.id)}
              />
            ) : (
              <span className="snippet-row__text">{snippet.text}</span>
            )}

            <span style={{ flexShrink: 0, marginTop: 1 }}>
              <Checkbox
                on={snippet.is_default}
                disabled={pending}
                onChange={() => toggleDefault(snippet)}
              >
                Default
              </Checkbox>
            </span>

            <div className="snippet-row__actions">
              {editingId === snippet.id ? (
                <IconButton
                  icon="check"
                  size={15}
                  title="Save clause"
                  onClick={() => saveEdit(snippet.id)}
                  disabled={pending}
                />
              ) : (
                <IconButton
                  icon="pen-line"
                  size={14}
                  title="Edit clause"
                  onClick={() => {
                    setEditingId(snippet.id);
                    setEditText(snippet.text);
                  }}
                />
              )}
              <IconButton
                icon="trash-2"
                size={14}
                title="Delete clause"
                onClick={() => remove(snippet.id)}
                disabled={pending}
              />
            </div>
          </div>
        ))}

        {list.length === 0 && (
          <div
            style={{
              padding: "10px 0",
              font: "400 13px/1.4 var(--font-sans)",
              color: "var(--muted-foreground)",
            }}
          >
            No {kind} clauses yet.
          </div>
        )}
      </div>
    </Card>
  );
}
