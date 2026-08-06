"use client";

import { useState, useTransition } from "react";
import { Button, Card } from "@/components/crm/ui";
import { useToast } from "@/components/crm/toast";
import { addLeadToPipeline } from "./actions";

export interface LeadRow {
  id: string;
  name: string;
  address: string;
  colour: string | null;
  bestTime: string | null;
  receivedLabel: string;
}

/**
 * Enquiries from roofing.sydney that never made it onto the board.
 *
 * The public lead route calls intake on submission, so in normal operation this
 * panel is empty and does not render at all. It exists because that call is
 * deliberately best-effort — a homeowner must never see a failed submission
 * because the CRM was briefly unreachable — and something has to catch the ones
 * that slipped through.
 */
export function LeadInbox({ leads }: { leads: LeadRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const push = useToast();

  if (leads.length === 0) return null;

  const add = (lead: LeadRow) => {
    setBusyId(lead.id);
    startTransition(async () => {
      const result = await addLeadToPipeline(lead.id);
      setBusyId(null);
      if (result.ok) push(`${lead.name} added to the pipeline`, "success", "user-plus");
      else push(result.error, "error");
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">New enquiries</div>
          <div className="card-sub">
            Straight from roofing.sydney and not yet on the board.
          </div>
        </div>
        <span className="ftab__count">{leads.length}</span>
      </div>

      {leads.map((lead) => (
        <div key={lead.id} className="snippet-row">
          <div className="snippet-row__text">
            <div style={{ font: "600 13px/1.3 var(--font-sans)" }}>{lead.name}</div>
            <div
              style={{
                marginTop: 3,
                font: "400 11.5px/1.4 var(--font-sans)",
                color: "var(--muted-foreground)",
              }}
            >
              {[lead.address, lead.colour, lead.bestTime].filter(Boolean).join(" · ")}
            </div>
          </div>
          <span
            className="mono"
            style={{ fontSize: 11.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}
          >
            {lead.receivedLabel}
          </span>
          <Button
            size="sm"
            variant="brand"
            icon="user-plus"
            disabled={pending && busyId === lead.id}
            onClick={() => add(lead)}
          >
            Add to pipeline
          </Button>
        </div>
      ))}
    </Card>
  );
}
