"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@/components/crm/icon";
import { Modal } from "@/components/crm/modal";
import { useToast } from "@/components/crm/toast";
import { Button, Field, IconButton, Input, PageHeader, QuoteStatusPill } from "@/components/crm/ui";
import { money } from "@/lib/money";
import { defaultSelection, priceSelection } from "@/lib/quote-pricing";
import type { Client, Quote, QuoteClause, QuoteItem, Settings } from "@/lib/db/types";

import { removeQuote } from "../actions";
import { formatDay, pdfFilename, quoteLabel, scopeFromQuoteItems } from "../helpers";
import type { PhotoView } from "../helpers";
import { issueAndSend, reviseQuoteAction, saveAsTemplate, sendFollowUp } from "./actions";
import { EmailModal } from "./email-modal";
import { PdfViewport } from "./pdf-preview";
import { QuoteRail } from "./quote-rail";

/**
 * One quote, and everything that can be done to it.
 *
 * The screen is organised around a single fact: once `sent_at` is set the
 * commercial content is frozen in Postgres. So there is no edit path here for an
 * issued quote — the button is replaced by "Revise", which raises a linked v2 and
 * supersedes this one. Offering an edit the database will refuse is worse than
 * offering none.
 */


export interface QuoteViewProps {
  quote: Quote;
  client: Client;
  items: QuoteItem[];
  clauses: QuoteClause[];
  photos: PhotoView[];
  settings: Settings;
  revisions: Quote[];
  portalUrl: string | null;
  defaultSubject: string;
  defaultBody: string;
  followUpSubject: string;
  followUpBody: string;
  openSend: boolean;
}

export function QuoteView({
  quote,
  client,
  items,
  clauses,
  photos,
  settings,
  revisions,
  portalUrl,
  defaultSubject,
  defaultBody,
  followUpSubject,
  followUpBody,
  openSend,
}: QuoteViewProps) {
  const router = useRouter();
  const toast = useToast();

  const [sendOpen, setSendOpen] = useState(openSend && !quote.sent_at);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateLabel, setTemplateLabel] = useState(quote.roof_type ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const issued = Boolean(quote.sent_at);
  const label = quoteLabel(quote);

  // The rail's internal figures price the printed scope: base lines at the
  // cheapest offered tier, no extras. The preview below takes the whole item
  // set and resolves it itself, exactly as the renderer does.
  const priced = useMemo(() => {
    const scope = scopeFromQuoteItems(items);
    return priceSelection(quote, scope, defaultSelection(scope));
  }, [quote, items]);

  const copyPortalLink = async () => {
    if (!portalUrl) return;
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast("Portal link copied", "success", "link-2");
    } catch {
      toast("Couldn't copy — select the link manually", "warning");
    }
  };

  const onIssue = async (input: { subject: string; body: string; subjectEdited: boolean }) => {
    const result = await issueAndSend(quote.id, input);
    if (!result.ok) {
      // Left open on purpose. Issuing legitimately refuses — no line items, no
      // client email, already sent — and closing the window would throw away the
      // message the operator wrote with no way back to it.
      toast(result.error, "warning");
      return;
    }
    setSendOpen(false);
    // The number is drawn either way. A mail failure is a warning on a success,
    // never an error that implies the quote was not issued.
    toast(result.warning ?? `Issued as ${result.quoteNumber} and sent`, result.warning ? "warning" : "success");
    router.refresh();
  };

  const onFollowUp = async (input: { subject: string; body: string }) => {
    const result = await sendFollowUp(quote.id, input);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    setFollowUpOpen(false);
    toast(result.warning ?? "Follow-up sent", result.warning ? "warning" : "success", "send");
    router.refresh();
  };

  const onRevise = async () => {
    setBusy(true);
    const result = await reviseQuoteAction(quote.id);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    toast(`${label} superseded — editing v${quote.version + 1}`, "success", "git-branch");
    router.push(`/quotes/${result.id}/edit`);
  };

  const onSaveTemplate = async () => {
    setBusy(true);
    const result = await saveAsTemplate(quote.id, { label: templateLabel });
    setBusy(false);
    setTemplateOpen(false);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    toast(`Saved as template "${result.label}"`, "success", "layout-template");
  };

  const onDelete = async () => {
    setBusy(true);
    const result = await removeQuote(quote.id);
    setBusy(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast(result.error, "warning");
      return;
    }
    toast(`${label} deleted`, "info", "trash-2");
    router.push("/quotes");
  };

  return (
    <div className="stack-6">
      <PageHeader
        crumbs={[{ label: "Quotes", href: "/quotes" }, { label }]}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12, whiteSpace: "nowrap" }}>
            {label}
            <QuoteStatusPill quote={quote} />
          </span>
        }
        description={`${quote.roof_type || "Roofing works"} · ${client.name}`}
        actions={
          <>
            <IconButton icon="trash-2" title="Delete quote" onClick={() => setConfirmDelete(true)} />
            <Button
              variant="ghost"
              icon="layout-template"
              onClick={() => setTemplateOpen(true)}
              disabled={busy}
            >
              Save as template
            </Button>
            {issued ? (
              <Button variant="outline" icon="git-branch" disabled={busy} onClick={() => void onRevise()}>
                Revise
              </Button>
            ) : (
              <Button variant="outline" icon="pen-line" onClick={() => router.push(`/quotes/${quote.id}/edit`)}>
                Edit
              </Button>
            )}
            <a className="btn btn--outline" href={`/api/quotes/${quote.id}/pdf`} download={pdfFilename(quote)}>
              <Icon name="download" size={15} />
              Download
            </a>
            {issued ? (
              <Button
                variant="brand"
                icon="mail"
                disabled={!client.email}
                onClick={() => setFollowUpOpen(true)}
              >
                Follow up
              </Button>
            ) : (
              <Button variant="brand" icon="send" onClick={() => setSendOpen(true)}>
                Issue &amp; send
              </Button>
            )}
          </>
        }
      />

      <div className="qview">
        <QuoteRail
          quote={quote}
          client={client}
          settings={settings}
          revisions={revisions}
          priced={priced}
          portalUrl={portalUrl}
          onCopyPortalLink={() => void copyPortalLink()}
        />

        <div className="qview__main">
          <div className="pdf-toolbar">
            <span className="section-label">Quote PDF preview</span>
            <span style={{ font: "400 12px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>
              A4 · {quote.show_breakdown ? "itemised" : "single line"} ·{" "}
              {quote.gst_enabled ? "inc GST" : "no GST"}
            </span>
            <div style={{ flex: 1 }} />
            <a
              className="btn btn--ghost btn--sm"
              href={`/api/quotes/${quote.id}/pdf`}
              download={pdfFilename(quote)}
            >
              <Icon name="download" size={14} />
              Download PDF
            </a>
          </div>
          <PdfViewport
            quote={quote}
            client={client}
            settings={settings}
            items={items}
            clauses={clauses}
            photos={photos}
          />
        </div>
      </div>

      {sendOpen && (
        <EmailModal
          title="Issue & send quote"
          sub={
            client.email
              ? `Sent from ${settings.email ?? "your business address"}`
              : "This client has no email on file"
          }
          to={client.email ?? ""}
          initialSubject={defaultSubject}
          initialBody={defaultBody}
          attachmentName={pdfFilename(quote)}
          sendLabel="Issue & send"
          note="Sending draws the quote number, freezes the totals and creates the client's online link — which is added to the message automatically. After that the quote can only be revised, not edited."
          onClose={() => setSendOpen(false)}
          onSend={onIssue}
        />
      )}

      {followUpOpen && client.email && (
        <EmailModal
          title="Follow up"
          sub={`${label} · sent ${formatDay(quote.sent_at)}`}
          to={client.email}
          initialSubject={followUpSubject}
          initialBody={followUpBody}
          attachmentName={quote.pdf_path ? pdfFilename(quote) : null}
          sendLabel="Send follow-up"
          onClose={() => setFollowUpOpen(false)}
          onSend={onFollowUp}
        />
      )}

      {templateOpen && (
        <Modal
          title="Save as template"
          sub="The line items and their costs, ready to start the next quote from."
          onClose={() => setTemplateOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="brand"
                icon="save"
                disabled={busy || !templateLabel.trim()}
                onClick={() => void onSaveTemplate()}
              >
                Save template
              </Button>
            </>
          }
        >
          <Field label="Template name" required hint="Costs are stored, never marked-up prices.">
            <Input
              value={templateLabel}
              onChange={(e) => setTemplateLabel(e.target.value)}
              placeholder="e.g. Full re-roof — Trimdek"
              autoFocus
            />
          </Field>
        </Modal>
      )}

      {confirmDelete && (
        <Modal
          title={`Delete ${label}?`}
          sub="This removes the quote permanently. The client record is unaffected."
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button variant="danger" icon="trash-2" disabled={busy} onClick={() => void onDelete()}>
                Delete quote
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: "var(--muted-foreground)" }}>
            {client.name} · {quote.roof_type || "Roofing works"} ·{" "}
            {money(quote.total_cents ?? priced.display.total)}
            {issued &&
              " — this quote has already been sent, and deleting it destroys the record of what the client received."}
          </p>
        </Modal>
      )}
    </div>
  );
}
