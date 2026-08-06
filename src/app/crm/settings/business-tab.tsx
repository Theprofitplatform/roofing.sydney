"use client";

import { useRef, useState, useTransition } from "react";
import { Icon, RoofMark } from "@/components/crm/icon";
import { useToast } from "@/components/crm/toast";
import { Button, Card, Field, Input, Textarea, Toggle } from "@/components/crm/ui";
import type { Settings } from "@/lib/db/types";
import { removeLogoAction, saveSettingsAction, uploadLogoAction } from "./actions";

/** The seeded wording every quote starts with, and must not go out carrying. */
const PLACEHOLDER_MARKER = "[ Payment terms placeholder";

type Draft = Pick<
  Settings,
  | "business_name"
  | "legal_name"
  | "owner_name"
  | "licence_no"
  | "abn"
  | "acn"
  | "phone"
  | "email"
  | "site"
  | "address"
  | "gst_registered"
  | "deposit_enabled"
  | "payment_terms"
> & { deposit_pct: string };

export function BusinessTab({
  settings,
  logoUrl,
}: {
  settings: Settings;
  logoUrl: string | null;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState(logoUrl);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    business_name: settings.business_name,
    legal_name: settings.legal_name,
    owner_name: settings.owner_name,
    licence_no: settings.licence_no,
    abn: settings.abn,
    acn: settings.acn,
    phone: settings.phone,
    email: settings.email,
    site: settings.site,
    address: settings.address,
    gst_registered: settings.gst_registered,
    deposit_enabled: settings.deposit_enabled,
    payment_terms: settings.payment_terms,
    // Held as text so a half-typed "12." survives the keystroke; parsed on save.
    deposit_pct: String(settings.deposit_pct),
  });

  const set = (patch: Partial<Draft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const text = (key: keyof Draft) => (draft[key] as string | null) ?? "";
  const stillPlaceholder = (draft.payment_terms ?? "").startsWith(PLACEHOLDER_MARKER);

  const save = () =>
    startTransition(async () => {
      const { deposit_pct, ...rest } = draft;
      const result = await saveSettingsAction({
        ...rest,
        deposit_pct: Number(deposit_pct) || 0,
      });
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setDirty(false);
      toast("Business details saved", "success", "check-circle");
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set("logo", file);
    startTransition(async () => {
      const result = await uploadLogoAction(form);
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setLogo(result.url);
      toast("Logo updated", "success", "image");
    });
  };

  const clearLogo = () =>
    startTransition(async () => {
      const result = await removeLogoAction();
      if (!result.ok) {
        toast(result.error, "error");
        return;
      }
      setLogo(null);
      toast("Logo removed", "info", "image");
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card padding>
        <div className="card-head">
          <div>
            <div className="card-title">Identity</div>
            <div className="card-sub">Appears on every quote header and PDF footer.</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="logo-drop">
            <span className="logo-drop__preview">
              {logo ? (
                // A signed storage URL with a short expiry, so next/image is the
                // wrong tool: the optimiser would cache the bytes behind a URL
                // that stops resolving, and re-fetch on a link that has expired.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logo}
                  alt="Business logo"
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              ) : (
                <RoofMark size={30} />
              )}
            </span>
            <div>
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon="upload"
                  disabled={pending}
                  onClick={() => fileRef.current?.click()}
                >
                  Upload logo
                </Button>
                {logo && (
                  <Button variant="ghost" size="sm" icon="x" disabled={pending} onClick={clearLogo}>
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <div
                style={{
                  font: "400 11.5px/1.4 var(--font-sans)",
                  color: "var(--muted-foreground)",
                  marginTop: 8,
                }}
              >
                PNG or SVG, square, under 512 KB. Falls back to the roof mark.
                Uploading applies straight away.
              </div>
            </div>
          </div>

          <div className="grid-2">
            <Field label="Business name">
              <Input
                value={text("business_name")}
                onChange={(e) => set({ business_name: e.target.value })}
              />
            </Field>
            <Field label="Legal name" hint="If it differs from the trading name">
              <Input
                value={text("legal_name")}
                onChange={(e) => set({ legal_name: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Owner / signatory" hint="Signs quote emails">
              <Input
                value={text("owner_name")}
                onChange={(e) => set({ owner_name: e.target.value })}
              />
            </Field>
            <Field label="Licence no." hint="NSW builder or roofing licence">
              <Input
                className="mono"
                value={text("licence_no")}
                onChange={(e) => set({ licence_no: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="ABN">
              <Input className="mono" value={text("abn")} onChange={(e) => set({ abn: e.target.value })} />
            </Field>
            <Field label="ACN">
              <Input className="mono" value={text("acn")} onChange={(e) => set({ acn: e.target.value })} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Phone">
              <Input value={text("phone")} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input value={text("email")} onChange={(e) => set({ email: e.target.value })} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Website">
              <Input value={text("site")} onChange={(e) => set({ site: e.target.value })} />
            </Field>
            <Field label="Business address">
              <Input value={text("address")} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card padding>
        <div className="card-head">
          <div>
            <div className="card-title">Tax &amp; terms</div>
            <div className="card-sub">Changing these affects future quotes only.</div>
          </div>
        </div>

        {/* role=group + aria-labelledby is what gives the bare switch a name:
            the shared Toggle renders its `label` visibly, and repeating the
            heading beside the track reads as a stutter on screen. */}
        <div className="toggle-card" style={{ marginTop: 0 }} role="group" aria-labelledby="gst-registered-label">
          <div>
            <div id="gst-registered-label" style={{ font: "600 13px/1.2 var(--font-sans)" }}>
              GST registered
            </div>
            <div
              style={{
                font: "400 11.5px/1.4 var(--font-sans)",
                color: "var(--muted-foreground)",
                marginTop: 3,
                maxWidth: 460,
              }}
            >
              This is the master switch. While it is off, the database refuses to
              enable GST on any individual quote — the per-quote toggle will be
              rejected, not silently ignored.
            </div>
          </div>
          <Toggle on={draft.gst_registered} onChange={(v) => set({ gst_registered: v })} />
        </div>

        <div className="toggle-card" role="group" aria-labelledby="deposit-label">
          <div>
            <div id="deposit-label" style={{ font: "600 13px/1.2 var(--font-sans)" }}>
              Deposit on acceptance
            </div>
            <div
              style={{
                font: "400 11.5px/1.4 var(--font-sans)",
                color: "var(--muted-foreground)",
                marginTop: 3,
              }}
            >
              Prints a “deposit due on acceptance” line on every quote PDF.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {draft.deposit_enabled && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Input
                  className="mono"
                  inputMode="decimal"
                  aria-label="Deposit percentage"
                  style={{ width: 64, textAlign: "right" }}
                  value={draft.deposit_pct}
                  onChange={(e) => set({ deposit_pct: e.target.value.replace(/[^0-9.]/g, "") })}
                />
                <span style={{ font: "500 13px/1 var(--font-sans)", color: "var(--muted-foreground)" }}>
                  %
                </span>
              </span>
            )}
            <Toggle on={draft.deposit_enabled} onChange={(v) => set({ deposit_enabled: v })} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <div className="inline-warn" style={{ marginTop: 0, marginBottom: 12 }}>
            <Icon name="alert-triangle" size={15} />
            <span>
              Owner-supplied text. For NSW licensed building work these terms must be
              written by the owner or professionally reviewed (for example against the
              NSW Home Building Act) — never generated by this tool.
            </span>
          </div>
          <Field
            label="Payment terms"
            hint="Printed verbatim on every quote PDF. Replace the placeholder before you send anything."
          >
            <Textarea
              style={{ minHeight: 180, lineHeight: 1.55 }}
              value={text("payment_terms")}
              onChange={(e) => set({ payment_terms: e.target.value })}
            />
          </Field>
          {stillPlaceholder && (
            <div className="inline-warn">
              <Icon name="alert-triangle" size={15} />
              This is still the shipped placeholder. Replace it before issuing a quote.
            </div>
          )}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Button variant="brand" icon="save" onClick={save} disabled={pending || !dirty}>
          Save business details
        </Button>
        <span
          className={`save-state ${pending ? "is-saving" : dirty ? "is-dirty" : "is-saved"}`}
        >
          <Icon name={pending ? "loader-2" : dirty ? "pen-line" : "check-circle"} size={13} />
          {pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
        </span>
      </div>
    </div>
  );
}
