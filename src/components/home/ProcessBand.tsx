import Image from "next/image";

const STEPS = [
  {
    n: "01",
    title: "On-site consult",
    body: "A senior roofer visits within 5 working days. Drone survey, thermal scan, timber condition check — all included.",
  },
  {
    n: "02",
    title: "Fixed-price quote",
    body: "Written quote within 48 hours. No provisional sums, no surprises. We show you exactly what's replaced and why.",
  },
  {
    n: "03",
    title: "Installation",
    body: "Most Sydney homes finish in 3–5 working days. Daily site photos sent straight to your phone.",
  },
  {
    n: "04",
    title: "Final handover",
    body: "Joint inspection, NSW Fair Trading compliance certificate, and 6-year workmanship warranty — all in writing.",
  },
];

export function ProcessBand() {
  return (
    <section id="process" className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-14 flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
              04 — Process
            </p>
            <h2 className="font-serif text-4xl font-light leading-tight text-foreground md:text-5xl">
              From <em className="italic">first call</em> to final tile.
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-muted md:text-right">
            Every job runs the same way — a fixed-price quote in writing, start date locked in,
            one project manager from start to finish.
          </p>
        </div>

        <ol className="grid gap-px rounded-2xl overflow-hidden border border-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.n}
              className="bg-background p-7"
              style={{ borderLeft: i > 0 ? "1px solid var(--border)" : undefined }}
            >
              <span className="text-xs font-mono font-medium text-accent">{s.n}</span>
              <h3 className="mt-3 text-base font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-4 grid grid-cols-3 gap-2 overflow-hidden rounded-2xl">
          {[
            { src: "/images/metal-install-2.jpg", alt: "Roofers installing standing seam metal panels" },
            { src: "/images/titanium-zinc.jpg", alt: "Modern home with zinc standing seam roof overlooking water" },
            { src: "/images/stone-coated-steel.jpg", alt: "Large home with stone-coated steel roof" },
          ].map((img) => (
            <div key={img.src} className="relative aspect-[4/3] overflow-hidden">
              <Image src={img.src} alt={img.alt} fill className="object-cover" sizes="(max-width:640px) 100vw, 33vw" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
