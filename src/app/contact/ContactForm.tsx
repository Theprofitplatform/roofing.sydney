"use client";

import { useId, useState } from "react";

const SERVICES = [
  "Colorbond re-roofing",
  "Standing seam (Copper / Zinc / Aluminium)",
  "Terracotta or concrete tile",
  "Leak detection & repair",
  "Gutters & downpipes",
  "Fascia, barge capping or skylights",
  "Commercial roofing",
  "Not sure yet",
];

export function ContactForm() {
  const ids = {
    name: useId(),
    phone: useId(),
    email: useId(),
    address: useId(),
    service: useId(),
    message: useId(),
  };

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    const fd = new FormData(e.currentTarget);
    const service = String(fd.get("service") ?? "").trim();
    const message = String(fd.get("message") ?? "").trim();
    const combinedNotes = service && service !== "Not sure yet"
      ? `[${service}]${message ? ` ${message}` : ""}`
      : message || undefined;

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? "").trim(),
          phone: String(fd.get("phone") ?? "").trim(),
          email: String(fd.get("email") ?? "").trim(),
          address: String(fd.get("address") ?? "").trim(),
          notes: combinedNotes,
          company: String(fd.get("company") ?? ""),
        }),
      });
      if (res.status === 201) { setDone(true); return; }
      const body = await res.json().catch(() => ({})) as { error?: string };
      setError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-12 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-foreground">Thanks — message received</h3>
        <p className="mt-2 max-w-xs text-sm text-muted">
          We&apos;ll get back to you within 48 hours on business days. For quotes, expect a written reply
          once we&apos;ve had a quick look at the property.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-7 space-y-5">
      <div>
        <h3 className="font-serif text-xl text-foreground">Send a message</h3>
        <p className="mt-1 text-sm text-muted">All fields required unless marked optional.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={ids.name} label="Your name">
          <input id={ids.name} name="name" required placeholder="Alex Chen" className="contact-input" />
        </Field>
        <Field id={ids.phone} label="Phone">
          <input id={ids.phone} name="phone" type="tel" required placeholder="0412 345 678" className="contact-input" />
        </Field>
        <Field id={ids.email} label="Email" className="sm:col-span-2">
          <input id={ids.email} name="email" type="email" required placeholder="you@example.com" className="contact-input" />
        </Field>
        <Field id={ids.address} label="Property address" className="sm:col-span-2">
          <input id={ids.address} name="address" required placeholder="12 Smith St, Cronulla NSW" className="contact-input" />
        </Field>
        <Field id={ids.service} label="Service needed" className="sm:col-span-2">
          <select id={ids.service} name="service" className="contact-input" defaultValue="">
            <option value="">Select a service…</option>
            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field id={ids.message} label="How can we help?" className="sm:col-span-2" optional>
          <textarea id={ids.message} name="message" rows={4} placeholder="Briefly describe the job — e.g. single-storey, current roof type, any leaks…" className="contact-input resize-y" />
        </Field>
      </div>

      {/* Honeypot */}
      <div aria-hidden className="hidden">
        <input name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Send message →"}
      </button>
      <p className="text-center text-xs text-muted-2">No obligation. We reply within 48 hours on business days.</p>

      <style>{`
        .contact-input {
          width:100%;border-radius:10px;border:1px solid var(--border-strong);
          background:var(--background);padding:10px 12px;font-size:14px;
          color:var(--foreground);outline:none;transition:box-shadow .15s,border-color .15s;
        }
        .contact-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ring);}
        .contact-input::placeholder{color:var(--muted-2);}
      `}</style>
    </form>
  );
}

function Field({ id, label, children, className = "", optional = false }: {
  id: string; label: string; children: React.ReactNode; className?: string; optional?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-foreground">
        {label}
        {optional && <span className="text-[10px] font-normal text-muted-2">optional</span>}
      </label>
      {children}
    </div>
  );
}
