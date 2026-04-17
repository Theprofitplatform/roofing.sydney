import { AddressAutocomplete } from "@/components/address-autocomplete";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="mx-auto max-w-5xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-32">
            <div className="flex flex-col items-center text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Serving Greater Sydney
              </span>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                See your new Colorbond roof
                <br className="hidden sm:block" />
                <span className="text-muted"> before you commit.</span>
              </h1>

              <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
                Enter your address, pick a colour, and see it on your actual
                home from above. Free preview. No-obligation quote.
              </p>

              <div className="mt-10 w-full max-w-xl">
                <AddressAutocomplete />
                <p className="mt-3 text-xs text-muted-2">
                  We use your address only to show you aerial imagery of your
                  home. Nothing is saved unless you book a quote.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center text-sm font-semibold uppercase tracking-wider text-muted">
              How it works
            </h2>
            <ol className="mt-10 grid gap-8 sm:grid-cols-3">
              <Step
                n={1}
                title="Find your home"
                body="Type your address. We pull a recent aerial photo from Nearmap."
              />
              <Step
                n={2}
                title="Pick a colour"
                body="Browse the full Colorbond range and apply it to your actual roof."
              />
              <Step
                n={3}
                title="Get a free quote"
                body="Happy with what you see? We'll send a licensed metal roofer out for a no-obligation quote."
              />
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="grid gap-6 sm:grid-cols-3">
            <Trust label="Licensed & insured" sub="NSW contractor licence" />
            <Trust label="10-year workmanship" sub="Plus Colorbond warranty" />
            <Trust label="Local Sydney crew" sub="Family-run, 20+ years" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="relative">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-foreground">
        {n}
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </li>
  );
}

function Trust({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-5">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </div>
  );
}
