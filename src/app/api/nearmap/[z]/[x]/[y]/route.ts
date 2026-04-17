import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = Promise<{ z: string; x: string; y: string }>;

const NEARMAP_CONTENT = "Vert";
const NEARMAP_FORMAT = "jpg";

export async function GET(
  _req: Request,
  { params }: { params: Params }
) {
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

  const key = process.env.NEARMAP_API_KEY;
  if (!key) {
    return new NextResponse("NEARMAP_API_KEY not configured", { status: 500 });
  }

  const url = `https://api.nearmap.com/tiles/v3/${NEARMAP_CONTENT}/${zn}/${xn}/${yn}.${NEARMAP_FORMAT}?apikey=${encodeURIComponent(
    key
  )}`;

  const upstream = await fetch(url, {
    headers: { Accept: "image/jpeg,image/png,image/*" },
  });

  if (!upstream.ok) {
    return new NextResponse(`Nearmap ${upstream.status}`, {
      status: upstream.status,
    });
  }

  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
