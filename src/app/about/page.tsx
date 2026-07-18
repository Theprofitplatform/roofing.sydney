import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "About — Australian Roofing Contractors",
  description:
    "Sydney metal roofing specialists since 2011. Family-run, NSW Fair Trading licensed (245723C), BlueScope Colorbond accredited. Meet director Stuart (Lee) Riley.",
};

const CREDENTIALS = [
  { label: "NSW Fair Trading Contractor Licence", value: "245723C" },
  { label: "Licence class", value: "Roof Plumbing" },
  { label: "BlueScope Colorbond Accredited", value: "Yes" },
  { label: "Public Liability Insurance", value: "$20M (Hollard)" },
  { label: "NSW Home Warranty Insurance", value: "Yes (for jobs over $20,000)" },
  { label: "ABN", value: "59 148 109 399" },
  { label: "ACN", value: "148 109 399" },
];

const VALUES = [
  {
    title: "Get it right the first time",
    body: "Every job is quoted, measured and installed to do the work once — not patched. That includes the parts you can't see: timber condition, flashings, sarking, ventilation.",
  },
  {
    title: "Aftercare matters",
    body: "A 6-year workmanship warranty on new work and a 1-year warranty on leak repairs, both in writing. Materials covered up to 25 years on BlueScope Colorbond steel.",
  },
  {
    title: "Plain, friendly communication",
    body: "Fixed-price quotes with no provisional sums. We explain the trade-offs in plain English so you can make the call that's right for your home and budget.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section style={{ background: "var(--hero-bg-gradient)" }}>
          <div className="mx-auto max-w-4xl px-6 py-20">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent">About</p>
            <h1 className="font-serif text-4xl font-light leading-tight md:text-5xl" style={{ color: "var(--hero-ink)" }}>
              A Sydney family business that <em className="italic" style={{ color: "#c8443b" }}>cares about the roof over your head.</em>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed" style={{ color: "var(--hero-ink-2)" }}>
              Australian Roofing Contractors has been re-roofing, repairing and re-gutter-ing
              Sydney homes since 2011 — around 150 roofs and counting. We work across metal
              re-roofing, terracotta and concrete tile, plus standing seam in copper, zinc and aluminium.
            </p>
          </div>
        </section>

        {/* Director bio */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <div className="grid gap-10 md:grid-cols-[1fr_2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-accent">Director</p>
                <h2 className="mt-2 font-serif text-2xl font-light text-foreground">Stuart (Lee) Riley</h2>
                <p className="mt-1 text-sm text-muted">Director &amp; Estimator</p>
              </div>
              <div className="space-y-5 text-sm leading-relaxed text-foreground">
                <p>
                  Lee has worked in roofing and construction for over 25 years. His focus
                  is straightforward — protect each client&apos;s investment by delivering high-quality
                  work, the first time.
                </p>
                <p>
                  &ldquo;I started this business because I wanted to offer high-quality work with great
                  after-sales service, and an eye on delivering exactly what the client wants — first time.&rdquo;
                </p>
                <p className="text-muted">
                  Today Australian Roofing Contractors runs with a tight full-time team and a network
                  of trusted subcontractors that scales from 2 to 20 depending on the project load,
                  so we can take on everything from a single leak repair through to multi-storey commercial roofs.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">How we work</p>
            <h2 className="font-serif text-3xl font-light leading-tight text-foreground md:text-4xl">
              Three things we won&apos;t budge on.
            </h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {VALUES.map((v) => (
                <div key={v.title} className="rounded-2xl border border-border bg-background p-7">
                  <h3 className="text-base font-semibold text-foreground">{v.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Credentials */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">Credentials &amp; trust</p>
            <h2 className="font-serif text-3xl font-light leading-tight text-foreground md:text-4xl">
              Licensed, insured, and accredited.
            </h2>
            <p className="mt-4 max-w-2xl text-sm text-muted">
              These are the documents Sydney homeowners ask for when vetting a roofer.
              Ask us for copies any time.
            </p>
            <dl className="mt-10 divide-y divide-border rounded-2xl border border-border bg-surface">
              {CREDENTIALS.map((c) => (
                <div key={c.label} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <dt className="text-sm text-muted">{c.label}</dt>
                  <dd className="text-sm font-semibold text-foreground">{c.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-foreground text-background">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <h2 className="font-serif text-3xl font-light leading-tight md:text-4xl">
              Want a fixed-price quote on your roof?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm opacity-70">
              Drop your details and we&apos;ll come and take a look. No deposit, no obligation.
              Quotes returned in writing within 48 hours.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/#quote"
                className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                style={{ background: "#c8443b", color: "#f1faee" }}
              >
                Request a free quote
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center rounded-full border border-white/30 px-5 py-3 text-sm transition-colors hover:bg-white/10"
              >
                Contact us
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
