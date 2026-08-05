"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, Card, Field, Input, InternalBadge } from "@/components/crm/ui";
import type { Settings } from "@/lib/db/types";
import { saveSettingsAction } from "./actions";

/**
 * Numbers are held as text and parsed on save. Parsing on every keystroke turns
 * a half-typed "12." into 12 and moves the caret, which makes the field fight
 * the operator the moment they try to enter a decimal.
 */
type Draft = {
  default_margin_pct: string;
  default_valid_days: string;
  margin_floor_pct: string;
  follow_up_days: string;
};

const decimal = (value: string) => value.replace(/[^0-9.]/g, "");
const whole = (value: string) => value.replace(/[^0-9]/g, "");

export function DefaultsTab({ settings }: { settings: Settings }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    default_margin_pct: String(settings.default_margin_pct),
    default_valid_days: String(settings.default_valid_days),
    margin_floor_pct: String(settings.margin_floor_pct),
    follow_up_days: String(settings.follow_up_days),
  });

  const set = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const floorAboveDefault =
    (Number(draft.margin_floor_pct) || 0) > (Number(draft.default_margin_pct) || 0);

  const save = () =>
    startTransition(async () => {
      const result = await saveSettingsAction({
        default_margin_pct: Number(draft.default_margin_pct) || 0,
        default_valid_days: Number(draft.default_valid_days) || 0,
        margin_floor_pct: Number(draft.margin_floor_pct) || 0,
        follow_up_days: Number(draft.follow_up_days) || 0,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setDirty(false);
      toast("Defaults saved", "success", "check-circle");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding>
        <div className="card-head">
          <div>
            <div className="card-title">Quote defaults</div>
            <div className="card-sub">
              New quotes start with these values. Existing quotes are untouched.
            </div>
          </div>
          <InternalBadge />
        </div>

        <div className="grid-2">
          <Field label="Default margin %" hint="Pre-filled on every new quote">
            <Input
              className="mono"
              inputMode="decimal"
              value={draft.default_margin_pct}
              onChange={(e) => set({ default_margin_pct: decimal(e.target.value) })}
            />
          </Field>
          <Field label="Default valid-for days" hint="How long a price holds after issue">
            <Input
              className="mono"
              inputMode="numeric"
              value={draft.default_valid_days}
              onChange={(e) => set({ default_valid_days: whole(e.target.value) })}
            />
          </Field>
          <Field label="Margin floor %" hint="Warn when a quote dips below this">
            <Input
              className="mono"
              inputMode="decimal"
              value={draft.margin_floor_pct}
              onChange={(e) => set({ margin_floor_pct: decimal(e.target.value) })}
            />
          </Field>
          <Field label="Follow-up after (days)" hint="Flag issued quotes nobody has opened">
            <Input
              className="mono"
              inputMode="numeric"
              value={draft.follow_up_days}
              onChange={(e) => set({ follow_up_days: whole(e.target.value) })}
            />
          </Field>
        </div>

        {floorAboveDefault && (
          <div className="inline-warn">
            <Icon name="alert-triangle" size={15} />
            The floor is above the default, so every new quote will open already
            flagged as under-priced.
          </div>
        )}

        <p
          style={{
            margin: "16px 0 0",
            font: "400 12px/1.5 var(--font-sans)",
            color: "var(--muted-foreground)",
          }}
        >
          The margin floor guards the margin, not the cost underneath it. A 20%
          margin on a supplier price that rose 12% is not a 20% margin — that is
          what the price book’s staleness flag is for.
        </p>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Button variant="brand" icon="save" onClick={save} disabled={pending || !dirty}>
          Save defaults
        </Button>
        <span className={`save-state ${pending ? "is-saving" : dirty ? "is-dirty" : "is-saved"}`}>
          <Icon name={pending ? "loader-2" : dirty ? "pen-line" : "check-circle"} size={13} />
          {pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
        </span>
      </div>
    </div>
  );
}
