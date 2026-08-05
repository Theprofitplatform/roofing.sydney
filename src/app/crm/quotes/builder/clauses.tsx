"use client";

import { useState } from "react";

import { Button, Checkbox, IconButton, Input } from "@/components/crm/ui";
import type { ClauseKind, Snippet } from "@/lib/db/types";

/**
 * The inclusions / exclusions checklist.
 *
 * What is stored is the TEXT, not a reference to the snippet it came from —
 * editing a library clause next year must not silently rewrite a quote sent last
 * year. A clause typed here that is not in the library is simply a line of text
 * like any other, which is why custom entries need no separate model.
 */
export function ClauseSection({
  kind,
  snippets,
  selected,
  onChange,
}: {
  kind: ClauseKind;
  snippets: Snippet[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const library = snippets.filter((s) => s.kind === kind);
  const libraryText = new Set(library.map((s) => s.text));
  const chosen = new Set(selected);
  const customs = selected.filter((text) => !libraryText.has(text));

  const toggle = (text: string) =>
    onChange(chosen.has(text) ? selected.filter((t) => t !== text) : [...selected, text]);

  const addCustom = () => {
    const text = draft.trim();
    if (!text || chosen.has(text)) {
      setDraft("");
      return;
    }
    onChange([...selected, text]);
    setDraft("");
  };

  return (
    <div>
      <div className="section-label" style={{ marginBottom: 10 }}>
        {kind === "inclusion" ? "Inclusions" : "Exclusions"}
      </div>

      <div className="clause-list">
        {library.map((snippet) => (
          <div className="clause-item" key={snippet.id}>
            <Checkbox on={chosen.has(snippet.text)} onChange={() => toggle(snippet.text)}>
              {snippet.text}
            </Checkbox>
          </div>
        ))}

        {customs.map((text) => (
          <div className="clause-item" key={`custom-${text}`} style={{ alignItems: "center" }}>
            <Checkbox on onChange={() => toggle(text)}>
              {text}
            </Checkbox>
            <IconButton
              icon="x"
              size={13}
              title="Remove custom clause"
              style={{ marginLeft: "auto" }}
              onClick={() => toggle(text)}
            />
          </div>
        ))}
      </div>

      <div className="clause-add-row">
        <Input
          placeholder={`Add a custom ${kind}…`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
        />
        <Button variant="subtle" size="sm" icon="plus" onClick={addCustom}>
          Add
        </Button>
      </div>
    </div>
  );
}
