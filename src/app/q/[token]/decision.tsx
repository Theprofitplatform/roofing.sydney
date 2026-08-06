"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea } from "@/components/crm/ui";
import { Icon } from "@/components/crm/icon";
import { money } from "@/lib/money";
import { StateBanner } from "./document";
import { acceptQuoteAction, declineQuoteAction } from "./actions";
import type { PortalSelection } from "./pricing";
import type { PortalView } from "./view-model";

/**
 * Accept, decline, or the settled record of whichever already happened.
 *
 * The expiry check here is a courtesy, not the guard — `accept_quote` refuses an
 * expired quote in Postgres and would refuse it if this component were bypassed
 * entirely. What this does is make sure a client is never shown a button that is
 * going to fail.
 */

export function Decision({
  view,
  selection,
  totalCents,
  tierLabel,
}: {
  view: PortalView;
  selection: PortalSelection;
  totalCents: number;
  tierLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (view.status === "accepted") {
    return (
      <div className="qsec">
        <StateBanner tone="ok" icon="check-circle" title="Accepted — thank you">
          Signed by <b>{view.signedName}</b>
          {view.acceptedAtLabel ? ` on ${view.acceptedAtLabel}` : ""}
          {view.acceptedTotalCents != null ? `, at ${money(view.acceptedTotalCents)}` : ""}. We&rsquo;ll
          be in touch to book the work in. Keep this link — it stays here as your record.
        </StateBanner>
      </div>
    );
  }

  if (view.status === "declined") {
    return (
      <div className="qsec">
        <StateBanner tone="neutral" icon="ban" title="You've declined this quote">
          Recorded{view.declinedAtLabel ? ` on ${view.declinedAtLabel}` : ""}. If that wasn&rsquo;t
          what you meant, give us a call and we&rsquo;ll sort it out.
        </StateBanner>
      </div>
    );
  }

  if (!view.acceptable) {
    return (
      <div className="qsec">
        <StateBanner
          tone="warn"
          icon="alert-triangle"
          title={view.expired ? "This quote has expired" : "This quote is no longer current"}
        >
          {view.expired
            ? `The prices held until ${view.validUntilLabel}. Give us a call and we'll re-quote at current prices — most of it won't have moved.`
            : "A newer version of this quote has been issued. Please use the most recent link we sent you, or give us a call."}
        </StateBanner>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction({
        token: view.token,
        signedName: name,
        tier: selection.tier,
        optionalIds: [...selection.optionalIds],
      });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  const decline = () => {
    setError(null);
    startTransition(async () => {
      const result = await declineQuoteAction({ token: view.token, reason });
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  };

  return (
    <div className="qsec" id="accept">
      <div className="qsec__h">Accept this quote</div>

      <p className="qsign__stmt">
        I accept quote {view.quoteNumber} from {view.business.name} for the works described above
        {tierLabel ? `, on the ${tierLabel} option` : ""}, at a total of{" "}
        <b>{money(totalCents)}</b>, including the inclusions, exclusions and payment terms.
      </p>

      <form
        className="qsign__row"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Your full name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Margaret Chen"
            autoComplete="name"
            enterKeyHint="done"
            maxLength={120}
            disabled={pending}
          />
        </Field>
        <Button type="submit" variant="brand" icon="pen-line" disabled={pending || name.trim().length < 2}>
          {pending ? "Recording…" : "Accept quote"}
        </Button>
      </form>

      <div className="qsign__small">
        Typing your name has the same effect as signing this quote. We record your name, the date
        and time, and the option you chose.
      </div>

      {error && (
        <div className="qerr" role="alert">
          <Icon name="alert-triangle" size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="qsign__alt">
        {declining ? (
          <>
            <Field
              label="Not going ahead?"
              hint="Optional — but knowing why genuinely helps us quote better."
            >
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Price, timing, went with someone else…"
                maxLength={500}
                disabled={pending}
              />
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => setDeclining(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="outline" icon="x" onClick={decline} disabled={pending}>
                {pending ? "Sending…" : "Decline this quote"}
              </Button>
            </div>
          </>
        ) : (
          <Button variant="ghost" icon="x" onClick={() => setDeclining(true)}>
            Not going ahead? Let us know
          </Button>
        )}
      </div>
    </div>
  );
}
