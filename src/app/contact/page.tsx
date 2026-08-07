import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact — Australian Roofing Contractors",
  description:
    "Get in touch with Sydney metal roofing specialists Australian Roofing Contractors. Email info@roofing.sydney — quotes returned in writing within 48 hours.",
};

const FAQ = [
  {
    q: "How fast will you respond?",
    a: "We aim to reply to all web enquiries within 48 hours during business days. Quotes are returned in writing once we've inspected the roof.",
  },
  {
    q: "Do you do emergency or after-hours work?",
    a: "Not at this stage — we focus on planned re-roofing, repairs and replacements. For urgent overnight emergencies (storm damage, etc.) you'll need a dedicated emergency response service. We're happy to step in and do the proper repair the next business day.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Bank transfer only. A 10% deposit is required on signed acceptance of the quote; the balance is due on completion.",
  },
  {
    q: "What's your warranty?",
    a: "1 year on leak repairs, 6 years on new work — both in writing. BlueScope Colorbond steel carries up to a 25-year materials warranty. Warranties transfer if the property is sold.",
  },
];

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section style={{ background: "var(--hero-bg-gradient)" }}>
          <div className="mx-auto max-w-4xl px-6 py-20">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-accent">Contact</p>
            <h1 className="font-serif text-4xl font-light leading-tight md:text-5xl" style={{ color: "var(--hero-ink)" }}>
              Let&apos;s talk about <em className="italic" style={{ color: "#c8443b" }}>your roof.</em>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed" style={{ color: "var(--hero-ink-2)" }}>
              Whether it&apos;s a single leak, a full re-roof or a commercial job — drop us a message
              and a licensed roofer will get back to you within 48 hours.
            </p>
          </div>
        </section>

        {/* Contact info + form */}
        <section className="border-t border-border bg-background">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
              {/* Info */}
              <div className="space-y-10">
                <div>
                  <h2 className="font-serif text-2xl font-light text-foreground">Get in touch</h2>
                  <p className="mt-2 text-sm text-muted">
                    Email is the fastest way to reach us — checked through the day.
                  </p>
                </div>

                <dl className="space-y-6 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-widest text-muted-2">Email</dt>
                    <dd className="mt-2">
                      <a href="mailto:info@roofing.sydney" className="text-base font-medium text-foreground hover:text-accent">
                        info@roofing.sydney
                      </a>
                    </dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-widest text-muted-2">Office hours</dt>
                    <dd className="mt-2 text-foreground">Monday – Friday · 9:00am – 4:00pm</dd>
                    <dd className="mt-1 text-xs text-muted">Closed weekends &amp; public holidays. No after-hours availability.</dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-widest text-muted-2">Response time</dt>
                    <dd className="mt-2 text-foreground">Within 48 hours on business days</dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-widest text-muted-2">Service type</dt>
                    <dd className="mt-2 text-foreground">Service-area only — no fixed shopfront</dd>
                    <dd className="mt-1 text-xs text-muted">We come to you anywhere across the suburbs we cover.</dd>
                  </div>

                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-widest text-muted-2">Business</dt>
                    <dd className="mt-2 text-foreground">Australian Roofing Contractors Pty Ltd</dd>
                    <dd className="mt-1 text-xs text-muted">
                      ABN 59 148 109 399 · NSW Fair Trading Licence 245723C
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Form */}
              <ContactForm />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">FAQ</p>
            <h2 className="font-serif text-3xl font-light leading-tight text-foreground md:text-4xl">
              A few questions we hear often.
            </h2>
            <dl className="mt-10 space-y-6">
              {FAQ.map((item) => (
                <div key={item.q} className="rounded-2xl border border-border bg-background p-6">
                  <dt className="text-sm font-semibold text-foreground">{item.q}</dt>
                  <dd className="mt-3 text-sm leading-relaxed text-muted">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Secondary CTA */}
        <section className="border-t border-border bg-foreground text-background">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center">
            <h2 className="font-serif text-2xl font-light md:text-3xl">
              Prefer to see your roof in a new colour first?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm opacity-70">
              Try our free AI Colorbond visualiser — drop your address and preview the colours on your actual home.
            </p>
            <Link
              href="/preview"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
            >
              Try the colour preview →
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
