import Link from "next/link";
import { redirect } from "next/navigation";
import { RoofEditor } from "@/components/roof-editor";
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
              Click your roof to preview a new colour
            </h1>
            {address && (
              <p className="mt-1 text-sm text-muted">{address}</p>
            )}
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <RoofEditor lat={latNum} lng={lngNum} />
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
