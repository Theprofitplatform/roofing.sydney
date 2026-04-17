import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = Promise<{ z: string; x: string; y: string }>;

type Provider = "mapbox" | "nearmap";

function pickProvider(): Provider {
  const raw = (process.env.TILE_PROVIDER ?? "mapbox").toLowerCase();
  return raw === "nearmap" ? "nearmap" : "mapbox";
}

function buildUpstreamUrl(provider: Provider, z: number, x: number, y: number): string | { error: string } {
  if (provider === "mapbox") {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return { error: "MAPBOX_ACCESS_TOKEN not configured" };
    // Mapbox satellite raster tiles — standard zoom/x/y scheme.
    return `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}.jpg90?access_token=${encodeURIComponent(token)}`;
  }
  const key = process.env.NEARMAP_API_KEY;
  if (!key) return { error: "NEARMAP_API_KEY not configured" };
  return `https://api.nearmap.com/tiles/v3/Vert/${z}/${x}/${y}.jpg?apikey=${encodeURIComponent(key)}`;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  const { z, x, y } = await params;
  const zn = Number(z);
  const xn = Number(x);
  const yn = Number(y);
  if (
    !Number.isInteger(zn) ||
    !Number.isInteger(xn) ||
    !Number.isInteger(yn) ||
    zn < 0 ||
    zn > 24
  ) {
    return new NextResponse("Bad tile coords", { status: 400 });
  }

  const provider = pickProvider();
  const built = buildUpstreamUrl(provider, zn, xn, yn);
  if (typeof built !== "string") {
    return new NextResponse(built.error, { status: 500 });
  }

  const upstream = await fetch(built, {
    headers: { Accept: "image/jpeg,image/png,image/*" },
  });
  if (!upstream.ok) {
    return new NextResponse(`Upstream ${provider} ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "x-tile-provider": provider,
    },
  });
}
