"use client";

import { useState } from "react";

import { Modal } from "@/components/crm/modal";
import { Button, Field, Input } from "@/components/crm/ui";
import { createClientForQuote } from "../actions";
import type { Client } from "@/lib/db/types";

/**
 * Add a client without abandoning a half-built quote.
 *
 * Deliberately the minimum: a site visit produces a name, a mobile and an
 * address, and anything else can be filled in later from the client record.
 * Email is optional here but flagged in the builder, because a quote cannot be
 * sent without one.
 */
export function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (client: Client) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await createClientForQuote({
      name,
      phone,
      email,
      property_address: address,
    });
    setSaving(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated(result.client);
  };

  return (
    <Modal
      title="New client"
      sub="Enough to quote against. The rest can wait for the client record."
      onClose={saving ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="brand"
            icon={saving ? "loader-2" : "user-plus"}
            className={saving ? "is-spinning" : ""}
            disabled={saving || !name.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Add client"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid-2">
          <Field label="Phone">
            <Input
              className="mono"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field label="Email" hint="Needed to send the quote.">
            <Input
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Property address">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        {error && (
          <p style={{ margin: 0, color: "var(--status-critical)" }}>{error}</p>
        )}
      </div>
    </Modal>
  );
}
