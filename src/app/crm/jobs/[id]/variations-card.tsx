"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, EmptyState, Field, StatusPill, Textarea } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import type { VariationRow } from "@/lib/db/jobs";
import { addVariation } from "../actions";
import { fmtMoment } from "../job-view";

/**
 * The exclusions on every issued quote tell the homeowner that latent
 * conditions "will be quoted as a variation". This card is that promise kept:
 * each variation is its own quote, priced and sent like any other, with the
 * trail back to the job it came out of visible from both ends.
 */
export function VariationsCard({
  jobId,
  variations,
}: {
  jobId: string;
  variations: VariationRow[];
}) {
  const [raising, setRaising] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const raise = () => {
    startTransition(async () => {
      const result = await addVariation(jobId, reason);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setRaising(false);
      setReason("");
      toast("Variation raised — price it and send it", "success", "corner-down-right");
      // Straight into the builder: a variation with no lines is not yet a quote,
      // and leaving it as an empty draft is how it gets forgotten.
      router.push(`/quotes/${result.quoteId}/edit`);
    });
  };

  return (
    <Card padding>
      <div className="card-head">
        <div>
          <div className="card-title">Variations</div>
          <div className="card-sub">
            Extra work found on site. Each one is raised as its own quote against this client,
            linked back to this job.
          </div>
        </div>
        <Button variant="outline" size="sm" icon="corner-down-right" onClick={() => setRaising(true)}>
          Raise a variation
        </Button>
      </div>

      {variations.length === 0 ? (
        <EmptyState icon="corner-down-right" title="No variations">
          Nothing beyond the original scope has been quoted on this job.
        </EmptyState>
      ) : (
        <div className="clause-list">
          {variations.map(({ variation, quote }) => (
            <div className="clause-item" key={variation.id}>
              <Icon name="corner-down-right" size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "500 13px/1.5 var(--font-sans)" }}>
                  {variation.reason || "Variation"}
                </div>
                <div
                  style={{
                    marginTop: 3,
                    font: "400 11.5px/1.4 var(--font-sans)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  Raised {fmtMoment(variation.created_at)}
                </div>
              </div>
              {quote ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <StatusPill status={quote.status} />
                  <Link href={`/quotes/${quote.id}`} className="mono" style={{ fontSize: 12 }}>
                    {quote.quote_number ?? "Draft"}
                  </Link>
                </div>
              ) : (
                <span style={{ font: "400 11.5px/1.4 var(--font-sans)", color: "var(--muted-foreground)" }}>
                  quote deleted
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {raising && (
        <Modal
          title="Raise a variation"
          sub="This opens a new draft quote against the same client, linked to this job."
          maxWidth={520}
          onClose={() => !pending && setRaising(false)}
          footer={
            <>
              <Button variant="ghost" disabled={pending} onClick={() => setRaising(false)}>
                Cancel
              </Button>
              <Button
                variant="brand"
                icon="corner-down-right"
                disabled={pending || !reason.trim()}
                onClick={raise}
              >
                {pending ? "Raising…" : "Raise and price it"}
              </Button>
            </>
          }
        >
          <Field
            label="What was found"
            required
            hint="This becomes the variation's description on the client's quote, so write it as they should read it."
          >
            <Textarea
              rows={4}
              value={reason}
              autoFocus
              placeholder="Battens under the eastern valley found rotted once the tiles came off."
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </Modal>
      )}
    </Card>
  );
}
