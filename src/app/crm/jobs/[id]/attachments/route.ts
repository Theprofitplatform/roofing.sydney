import { revalidateCrm } from "@/lib/revalidate";
import { NextResponse, type NextRequest } from "next/server";
import { addAttachment } from "@/lib/db/jobs";
import { QUOTE_BUCKET } from "@/lib/db/portal";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase-server";
import type { AttachmentKind } from "@/lib/db/types";
import { ATTACHMENT_KINDS, MAX_ATTACHMENT_BYTES, fmtBytes } from "../../job-view";

/**
 * Uploading job paperwork.
 *
 * This is a route handler rather than a server action on purpose. Server action
 * request bodies are capped at 1 MB by default, and the documents this feature
 * exists to hold — an engineer's report, a scanned colour sheet — routinely
 * exceed that. A route handler takes the multipart body without the cap, so the
 * feature does not depend on a build-level config knob being set correctly.
 */

/** Filenames become storage keys, and a storage key is a path. */
function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+/, "");
  return (cleaned || "file").slice(0, 80);
}

function bad(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;

  // Middleware has already turned unauthenticated CRM traffic away; this is the
  // second lock, because a route handler is a URL anyone can POST to.
  const user = await getCurrentUser();
  if (!user) return bad("Your session has expired — sign in again.", 401);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return bad("Choose a file to attach.", 400);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return bad(`That file is over ${fmtBytes(MAX_ATTACHMENT_BYTES)} — too large to attach.`, 413);
  }

  const requested = String(form.get("kind") ?? "");
  const kind: AttachmentKind = (ATTACHMENT_KINDS as readonly string[]).includes(requested)
    ? (requested as AttachmentKind)
    : "other";
  const caption = String(form.get("caption") ?? "").trim() || null;

  // Two files named "report.pdf" are two documents, not one — the random prefix
  // keeps the second from being refused or, worse, silently replacing the first.
  const path = `jobs/${jobId}/${crypto.randomUUID()}-${safeName(file.name)}`;

  // Service role for the object, exactly as the issued-PDF path does: the bucket
  // is private and carries no policies of its own. Authority for the record
  // still comes from `addAttachment` below, which runs under the operator's RLS.
  const storage = getSupabaseAdmin().storage.from(QUOTE_BUCKET);
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (uploadError) {
    console.error("attachment upload failed", path, uploadError);
    return bad("The file could not be stored. Try again.", 502);
  }

  try {
    const attachment = await addAttachment(jobId, path, kind, file.name, caption, user.id);
    revalidateCrm(`/jobs/${jobId}`);
    return NextResponse.json({ id: attachment.id });
  } catch (error) {
    // The row is what makes the file findable. Without it the upload is litter
    // in a private bucket, so take it back out rather than leave it orphaned.
    await storage.remove([path]);
    console.error("attachment record failed", jobId, error);
    return bad("That file could not be attached to the job. Try again.", 500);
  }
}
