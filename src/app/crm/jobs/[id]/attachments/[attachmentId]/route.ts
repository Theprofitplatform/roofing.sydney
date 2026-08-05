import { NextResponse } from "next/server";
import { listAttachments } from "@/lib/db/jobs";
import { signedPdfUrl } from "@/lib/db/portal";
import { getCurrentUser } from "@/lib/supabase-server";

/**
 * Download an attachment.
 *
 * A redirect rather than a signed URL rendered into the page: the link in the
 * markup stays a plain application URL, and the signed one is minted at the
 * moment of the click and never lands in the DOM or in a shared screenshot.
 */

/** Long enough to follow one redirect. A signed URL sitting in browser history is a leak. */
const DOWNLOAD_TTL_SECONDS = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id: jobId, attachmentId } = await params;

  const user = await getCurrentUser();
  if (!user) return new NextResponse("Your session has expired — sign in again.", { status: 401 });

  // Reading through the job scopes the lookup twice over: RLS decides whether
  // this operator sees the job at all, and the id in the URL cannot be swapped
  // for an attachment belonging to a different one.
  const attachments = await listAttachments(jobId);
  const attachment = attachments.find((a) => a.id === attachmentId);
  if (!attachment) return new NextResponse("Attachment not found.", { status: 404 });

  const url = await signedPdfUrl(attachment.storage_path, DOWNLOAD_TTL_SECONDS);
  if (!url) return new NextResponse("That file is no longer in storage.", { status: 404 });

  return NextResponse.redirect(url);
}
