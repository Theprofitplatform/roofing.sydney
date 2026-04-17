import { NextResponse } from "next/server";
import { getReplicate, SAM2_MODEL } from "@/lib/replicate";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  image: string; // data URI or public URL
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.image || typeof body.image !== "string") {
    return NextResponse.json(
      { error: "Missing image field" },
      { status: 400 }
    );
  }

  // Rough size guard — data URIs larger than ~8 MB are almost certainly
  // a bug (we expect ~0.5–2 MB captured aerials).
  if (body.image.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  try {
    const replicate = getReplicate();
    const [modelOwner, modelRest] = SAM2_MODEL.split("/");
    const [modelName, version] = modelRest.split(":");
    const prediction = await replicate.predictions.create({
      version,
      input: {
        image: body.image,
        use_m2m: true,
        points_per_side: 32,
        pred_iou_thresh: 0.88,
        stability_score_thresh: 0.95,
        multimask_output: false,
      },
    });
    return NextResponse.json({ predictionId: prediction.id }, {
      headers: { "x-model": `${modelOwner}/${modelName}` },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Replicate call failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
