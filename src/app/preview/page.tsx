import Link from "next/link";
import { redirect } from "next/navigation";
import { AerialMap } from "@/components/aerial-map";
import { SiteHeader } from "@/components/site-header";

type SearchParams = Promise<{
  lat?: string;
  lng?: string;
  address?: string;
  placeId?: string;
}>;

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { lat, lng, address, placeId } = await searchParams;

  const latNum = lat ? Number(lat) : NaN;
  const lngNum = lng ? Number(lng) : NaN;

  if (
    !Number.isFinite(latNum) ||
    !Number.isFinite(lngNum) ||
    latNum < -44 ||
    latNum > -10 ||
    lngNum < 112 ||
    lngNum > 154
  ) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex flex-col gap-1">
            <Link
              href="/"
              className="text-xs font-medium text-muted hover:text-foreground"
            >
              ← Change address
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Here&apos;s your roof from above
            </h1>
            {address && (
              <p className="mt-1 text-sm text-muted">{address}</p>
            )}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <AerialMap lat={latNum} lng={lngNum} />
          </div>

          <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-border bg-background p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">
                Next: pick your Colorbond colour
              </div>
              <div className="text-xs text-muted">
                We&apos;ll outline your roof and let you preview every colour
                on it.
              </div>
            </div>
            <button
              disabled
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white opacity-40"
              title="Coming next"
            >
              Choose a colour →
            </button>
          </div>

          {placeId && (
            <p className="mt-4 text-[11px] text-muted-2">
              Place ID: <span className="font-mono">{placeId}</span>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
