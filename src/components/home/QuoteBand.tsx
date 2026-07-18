"use client";

import { useState, useId } from "react";

const SERVICES = [
  "Colorbond re-roofing",
  "Leak detection & repair",
  "Gutters & downpipes",
  "Storm / insurance damage",
  "Not sure yet",
];

const SELLING_POINTS = [
  "Site inspection within 5 working days",
  "Written fixed-price quote — no provisional sums",
  "Zero obligation, no deposit to quote",
  "6-year workmanship warranty (25-year materials) on paper",
];

export function QuoteBand() {
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const addrId = useId();
  const serviceId = useId();
  const notesId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const fd = new FormData(e.currentTarget);
    const service = String(fd.get("service") ?? "").trim();
    const notes = String(fd.get("notes") ?? "").trim();
    const combinedNotes = service && service !== "Not sure yet"
      ? `[${service}]${notes ? ` ${notes}` : ""}`
      : notes || undefined;

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

  return (
    <section id="quote" className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
          {/* Left */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
              06 — Get a free quote
            </p>
            <h2 className="font-serif text-4xl font-light leading-tight text-foreground md:text-5xl">
              Honest pricing,{" "}
              <em className="italic">in writing,</em> within 48 hours.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-muted max-w-sm">
              Every quote includes a drone roof survey, fixed price, material breakdown,
              project timeline and our 6-year workmanship warranty (25-year materials) on paper.
            </p>
            <ul className="mt-8 space-y-3">
              {SELLING_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm text-foreground">
                  <svg className="mt-0.5 shrink-0 text-accent" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {p}
                </li>
              ))}
            </ul>
            {process.env.NEXT_PUBLIC_CONTACT_PHONE && (
              <a
                href={`tel:${process.env.NEXT_PUBLIC_CONTACT_PHONE.replace(/[\s()]/g, "")}`}
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground underline-offset-2 hover:underline"
              >
                Or call {process.env.NEXT_PUBLIC_CONTACT_PHONE} — Mon–Fri 9am–4pm
              </a>
            )}
          </div>

          {/* Right: form */}
          {done ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-background p-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Thanks — we&apos;ve got your details</h3>
              <p className="mt-2 max-w-xs text-sm text-muted">
                A licensed metal roofer will call you within 48 hours to schedule a free on-site inspection.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-background p-7 space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id={nameId} label="Your name">
                  <input id={nameId} name="name" required placeholder="Alex Chen" className="form-input" />
                </Field>
                <Field id={phoneId} label="Phone">
                  <input id={phoneId} name="phone" type="tel" required placeholder="0412 345 678" className="form-input" />
                </Field>
                <Field id={emailId} label="Email" className="sm:col-span-2">
                  <input id={emailId} name="email" type="email" required placeholder="you@example.com" className="form-input" />
                </Field>
                <Field id={addrId} label="Property address" className="sm:col-span-2">
                  <input id={addrId} name="address" required placeholder="12 Bronte Rd, Bondi Junction NSW" className="form-input" />
                </Field>
                <Field id={serviceId} label="Service needed" className="sm:col-span-2">
                  <select id={serviceId} name="service" className="form-input" defaultValue="">
                    <option value="">Select a service…</option>
                    {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field id={notesId} label="Anything else?" className="sm:col-span-2" optional>
                  <textarea id={notesId} name="notes" rows={3} placeholder="e.g. single-storey, heritage-listed, solar panels…" className="form-input resize-y" />
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
                {submitting ? "Sending…" : "Request my free quote →"}
              </button>
              <p className="text-center text-xs text-muted-2">No obligation. No deposit. Quoted within 48 hours.</p>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .form-input {
          width:100%;border-radius:10px;border:1px solid var(--border-strong);
          background:var(--background);padding:10px 12px;font-size:14px;
          color:var(--foreground);outline:none;transition:box-shadow .15s,border-color .15s;
        }
        .form-input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ring);}
        .form-input::placeholder{color:var(--muted-2);}
      `}</style>
    </section>
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
