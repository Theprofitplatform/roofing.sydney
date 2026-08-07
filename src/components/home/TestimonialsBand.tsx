const PRIMARY_AREAS = [
  "Oatley",
  "Hurstville",
  "Sans Souci",
  "Cronulla",
  "Woolooware",
  "Maroubra",
  "Randwick",
  "Clovelly",
  "Glebe",
  "Annandale",
];

const NOT_COVERED = ["Northern Beaches", "Western Sydney", "Wollongong"];

export function TestimonialsBand() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
            05 — Where we work
          </p>
          <h2 className="font-serif text-4xl font-light text-foreground md:text-5xl">
            Servicing the <em className="italic">Sydney suburbs</em> we know best.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Eastern Suburbs, Inner West and St George — plus surrounding areas. If your postcode isn&apos;t listed,
            give us a call and we&apos;ll let you know if we can help.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-border bg-surface p-8">
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-2">
              Primary service areas
            </h3>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {PRIMARY_AREAS.map((suburb) => (
                <li key={suburb} className="flex items-center gap-2 text-sm text-foreground">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c8443b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {suburb}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-8">
            <h3 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-2">
              Areas we don&apos;t cover
            </h3>
            <ul className="space-y-3 text-sm text-muted">
              {NOT_COVERED.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
            <p className="mt-5 text-xs leading-relaxed text-muted-2">
              We focus on Sydney metro to keep response times tight and our work quality consistent.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
