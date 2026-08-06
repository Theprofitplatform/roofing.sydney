"use server";

import { revalidateCrm } from "@/lib/revalidate";
import { deleteAttachment, listAttachments } from "@/lib/db/jobs";
import { QUOTE_BUCKET } from "@/lib/db/portal";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Removing job paperwork.
 *
 * The upload half is a route handler rather than a server action — see
 * `[id]/attachments/route.ts` for why. Deleting carries no file body, so it
 * stays here with the rest of the job's actions.
 */

export async function removeAttachment(
  jobId: string,
  attachmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // The storage path is read back from the database, never taken from the
    // caller. The object is deleted with the service role, so a path arriving
    // from the browser would be an unauthenticated instruction to remove any
    // file in the bucket — an issued quote PDF, say. Reading through the job
    // also scopes the lookup: RLS decides whether this operator sees the job at
    // all, and the id in the form cannot be swapped for another job's document.
    const attachment = (await listAttachments(jobId)).find((a) => a.id === attachmentId);
    if (!attachment) return { ok: false, error: "That attachment is no longer on this job." };

    // The row first, and the file second. A row pointing at a file that is gone
    // is a broken download the operator has to reason about; a file left behind
    // in a private bucket with no row is invisible and harmless.
    await deleteAttachment(attachment.id);

    // A delete filtered away by RLS removes nothing and raises nothing — that is
    // how "crew may attach, but not remove" reads from here. Confirm the row is
    // actually gone before the service role touches the file, or a crew member
    // would delete the document while the record that points at it survives.
    if ((await listAttachments(jobId)).some((a) => a.id === attachmentId)) {
      return { ok: false, error: "You do not have permission to remove attachments." };
    }

    const { error } = await getSupabaseAdmin()
      .storage.from(QUOTE_BUCKET)
      .remove([attachment.storage_path]);
    if (error) {
      console.error("removeAttachment: storage object left behind", attachment.storage_path, error);
    }

    revalidateCrm(`/jobs/${jobId}`);
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Could not remove that attachment. Try again." };
  }
}
