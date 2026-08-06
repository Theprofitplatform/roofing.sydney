"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, Card, IconButton } from "@/components/crm/ui";
import type { TemplateInput } from "@/lib/db/library";
import type { JobTemplate } from "@/lib/db/types";
import {
  archiveTemplateAction,
  createTemplateAction,
  updateTemplateAction,
} from "./actions";
import { TemplateForm } from "./template-form";

/**
 * Job templates — `window.ARC_TEMPLATES` in the prototype, hardcoded and
 * uneditable. The point of moving them into a table is that the quote John just
 * spent an hour costing becomes the starting point for the next one, so the list
 * has to be editable by the person who builds the quotes.
 */
export function TemplatesTab({ templates }: { templates: JobTemplate[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<JobTemplate | "new" | null>(null);

  const save = (patch: Partial<TemplateInput>) => {
    const target = editing;
    startTransition(async () => {
      const result =
        target && target !== "new"
          ? await updateTemplateAction(target.id, patch)
          : await createTemplateAction(patch);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setEditing(null);
      toast(
        target && target !== "new" ? "Template updated" : "Template created",
        "success",
        "check-circle",
      );
    });
  };

  const archive = (template: JobTemplate) =>
    startTransition(async () => {
      const result = await archiveTemplateAction(template.id);
      if (result.ok) toast(`“${template.label}” archived`, "info", "ban");
      else toast(result.error, "error");
    });

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Quote templates</div>
          <div className="card-sub">
            What the builder offers when you start a new quote.
          </div>
        </div>
        <Button variant="subtle" size="sm" icon="plus" onClick={() => setEditing("new")}>
          New template
        </Button>
      </div>

      {templates.length === 0 ? (
        <div
          style={{
            padding: "10px 0",
            font: "400 13px/1.4 var(--font-sans)",
            color: "var(--muted-foreground)",
          }}
        >
          No templates yet. Build a quote you are happy with and save it as one, or
          create an empty shell here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((template) => (
            <div key={template.id} className="tpl-item" style={{ cursor: "default" }}>
              <span
                className={`tpl-item__icon ${template.icon ? "" : "tpl-item__icon--blank"}`}
              >
                <Icon name={template.icon ?? "layout-template"} size={18} />
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="tpl-item__name">{template.label}</span>
                <span className="tpl-item__sub">
                  {template.sub ?? template.roof_type ?? "No description"}
                  {template.margin_pct != null ? ` · ${template.margin_pct}% margin` : ""}
                  {template.valid_days != null ? ` · valid ${template.valid_days} days` : ""}
                </span>
              </div>

              <span className="tpl-item__count">
                {template.line_items.length} line
                {template.line_items.length === 1 ? "" : "s"}
              </span>

              <div className="snippet-row__actions">
                <IconButton
                  icon="pen-line"
                  size={14}
                  title="Edit template"
                  onClick={() => setEditing(template)}
                />
                <IconButton
                  icon="ban"
                  size={14}
                  title="Archive template"
                  onClick={() => archive(template)}
                  disabled={pending}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <p
        style={{
          margin: "14px 0 0",
          font: "400 11.5px/1.5 var(--font-sans)",
          color: "var(--muted-foreground)",
        }}
      >
        Templates carry supplier cost, never a marked-up price — a template that
        stored sell prices would double the margin the moment a quote applied its
        own. Archived templates stay on file so an old quote’s provenance holds.
      </p>

      {editing && (
        <TemplateForm
          initial={editing === "new" ? null : editing}
          saving={pending}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </Card>
  );
}
