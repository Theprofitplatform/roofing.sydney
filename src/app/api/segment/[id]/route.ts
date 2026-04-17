import { NextResponse } from "next/server";
import sharp from "sharp";
import { getReplicate, type Sam2Output } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = Promise<{ id: string }>;

type MaskHit = {
  url: string;
  area: number;
};

export async function GET(
  req: Request,
  { params }: { params: Params }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const clickX = Number(url.searchParams.get("x"));
  const clickY = Number(url.searchParams.get("y"));

  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    return NextResponse.json(
      { error: "Missing or invalid x/y query params" },
      { status: 400 }
    );
  }

  const replicate = getReplicate();
  const prediction = await replicate.predictions.get(id);

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return NextResponse.json(
      { status: prediction.status, error: prediction.error ?? "Segmentation failed" },
      { status: 200 }
    );
  }

  if (prediction.status !== "succeeded") {
    return NextResponse.json({ status: prediction.status });
  }

  const output = prediction.output as Sam2Output | null;
  if (!output?.individual_masks?.length) {
    return NextResponse.json(
      { status: "failed", error: "No masks returned" },
      { status: 200 }
    );
  }

  const hit = await pickSmallestMaskContaining(
    output.individual_masks,
    Math.round(clickX),
    Math.round(clickY)
  );

  if (!hit) {
    return NextResponse.json({
      status: "succeeded",
      maskUrl: null,
      message: "No segment contains the clicked point — try clicking the centre of the roof.",
    });
  }

  return NextResponse.json({
    status: "succeeded",
    maskUrl: hit.url,
    maskArea: hit.area,
  });
}

async function pickSmallestMaskContaining(
  urls: string[],
  x: number,
  y: number
): Promise<MaskHit | null> {
  const results = await Promise.all(
    urls.map(async (u): Promise<MaskHit | null> => {
      try {
        const res = await fetch(u);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        const { data, info } = await sharp(buf)
          .greyscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        if (x < 0 || y < 0 || x >= info.width || y >= info.height) return null;
        const idx = y * info.width + x;
        if (data[idx] <= 127) return null;
        // Count white pixels as mask area.
        let area = 0;
        for (let i = 0; i < data.length; i++) {
          if (data[i] > 127) area++;
        }
        return { url: u, area };
      } catch {
        return null;
      }
    })
  );
  const hits = results.filter((r): r is MaskHit => r !== null);
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.area - b.area);
  return hits[0];
}
