"use client";

import { useId, useState } from "react";
import type { ColorbondColour } from "@/lib/colorbond";

type Props = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
  colour: ColorbondColour | null;
};

type FieldErrors = Partial<Record<"name" | "phone" | "email" | "bestTime" | "notes" | "company", string>>;

export function LeadForm({ address, lat, lng, placeId, colour }: Props) {
  const ids = {
    name: useId(),
    phone: useId(),
    email: useId(),
    best: useId(),
    notes: useId(),
  };
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setServerError(null);
    setFieldErrors({});

    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      bestTime: String(form.get("bestTime") ?? "").trim() || undefined,
      notes: String(form.get("notes") ?? "").trim() || undefined,
      company: String(form.get("company") ?? ""),
      address,
      lat,
      lng,
      placeId,
      selectedColourId: colour?.id,
      selectedColourName: colour?.name,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        setDone(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        errors?: { field: keyof FieldErrors; message: string }[];
      };
      if (body.errors) {
        const next: FieldErrors = {};
        for (const err of body.errors) next[err.field] = err.message;
        setFieldErrors(next);
      }
      setServerError(body.error ?? (body.errors ? "Please check the highlighted fields." : "Something went wrong."));
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="m5 13 4 4 10-10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-foreground">Thanks — we&apos;ve got your details</h3>
        <p className="mt-1 text-sm text-muted">
          A local metal roofer will call you within one business day to schedule
          a free on-site quote.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-background p-5 sm:p-6">
      <h3 className="text-base font-semibold text-foreground">Book your free on-site quote</h3>
      <p className="mt-1 text-xs text-muted">
        A licensed metal roofer will call you back within one business day — no obligation.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field id={ids.name} label="Your name" error={fieldErrors.name}>
          <input
            id={ids.name}
            name="name"
            autoComplete="name"
            required
            className="input"
            placeholder="Alex Chen"
          />
        </Field>

        <Field id={ids.phone} label="Phone" error={fieldErrors.phone}>
          <input
            id={ids.phone}
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            className="input"
            placeholder="0412 345 678"
            inputMode="tel"
          />
        </Field>

        <Field id={ids.email} label="Email" error={fieldErrors.email} className="sm:col-span-2">
          <input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input"
            placeholder="you@example.com"
          />
        </Field>

        <Field id={ids.best} label="Best time to call" className="sm:col-span-1" optional>
          <select id={ids.best} name="bestTime" className="input" defaultValue="">
            <option value="">Any time</option>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
            <option value="Weekends">Weekends</option>
          </select>
        </Field>

        <Field id={ids.notes} label="Anything else?" className="sm:col-span-2" optional>
          <textarea
            id={ids.notes}
            name="notes"
            rows={3}
            className="input resize-y"
            placeholder="Leaking near valley, single-storey, age of roof unknown…"
          />
        </Field>
      </div>

      {/* Honeypot — bots fill this, humans don't see it */}
      <div aria-hidden className="hidden">
        <label>
          Company
          <input name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div>
            <span className="text-muted-2">Home:</span>{" "}
            <span className="text-foreground">{address}</span>
          </div>
          {colour && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-muted-2">Chosen colour:</span>
              <span
                className="inline-block h-3 w-3 rounded-sm border border-border"
                style={{ backgroundColor: colour.hex }}
              />
              <span className="text-foreground">{colour.name}</span>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Request my quote"}
        </button>
      </div>

      {serverError && (
        <p className="mt-3 text-sm text-red-600" role="alert">{serverError}</p>
      )}

      <style>{`
        .input {
          width: 100%;
          border-radius: 10px;
          border: 1px solid var(--border-strong);
          background: var(--background);
          padding: 10px 12px;
          font-size: 14px;
          color: var(--foreground);
          outline: none;
          transition: box-shadow .15s, border-color .15s;
        }
        .input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--ring);
        }
        .input::placeholder { color: var(--muted-2); }
      `}</style>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
  className = "",
  optional = false,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  optional?: boolean;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-2 text-xs font-medium text-foreground">
        {label}
        {optional && <span className="text-[10px] font-normal text-muted-2">optional</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
