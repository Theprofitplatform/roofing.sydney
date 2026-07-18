"use client";

import { useState } from "react";

const SERVICES = [
  "Colorbond re-roofing",
  "Leak detection & repair",
  "Gutters & downpipes",
  "Storm / insurance damage",
  "Not sure yet",
];

export function QuoteForm() {
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
    const notes = [service ? `[${service}]` : "", message].filter(Boolean).join(" ") || undefined;

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
          notes,
          company: String(fd.get("company") ?? ""),
        }),
      });
      if (res.status === 201) {
        setDone(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="sent" role="status">
          Thanks — we&apos;ve got it. A senior roofer will call you within one business day.
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="frow">
        <div>
          <label htmlFor="qf-name">Your name</label>
          <input id="qf-name" name="name" required placeholder="Jane Citizen" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="qf-phone">Phone</label>
          <input id="qf-phone" name="phone" type="tel" required placeholder="04xx xxx xxx" autoComplete="tel" />
        </div>
      </div>
      <div>
        <label htmlFor="qf-email">Email</label>
        <input id="qf-email" name="email" type="email" required placeholder="you@email.com" autoComplete="email" />
      </div>
      <div>
        <label htmlFor="qf-address">Property address</label>
        <input id="qf-address" name="address" required placeholder="12 Example St, Oatley NSW" autoComplete="street-address" />
      </div>
      <div>
        <label htmlFor="qf-service">Service needed</label>
        <select id="qf-service" name="service" required defaultValue="">
          <option value="" disabled>
            Select a service…
          </option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="qf-message">
          Anything else? <span style={{ textTransform: "none", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea id="qf-message" name="message" rows={3} placeholder="Tell us about your roof…" />
      </div>

      {/* Honeypot */}
      <div aria-hidden style={{ position: "absolute", left: "-9999px" }}>
        <input name="company" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p className="formerr" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={submitting} style={{ justifyContent: "center" }}>
        {submitting ? "Sending…" : "Request my free quote →"}
      </button>
      <p className="formnote">No obligation. No deposit. Quoted within 48 hours.</p>
    </form>
  );
}
