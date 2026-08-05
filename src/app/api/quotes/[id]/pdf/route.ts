import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/supabase-server";
import { getQuote } from "@/lib/db/quotes";
import { getSettings } from "@/lib/db/library";
import { readQuotePdf } from "@/lib/db/portal";
import { renderQuotePdf } from "@/lib/pdf/render";
import { pdfFilename } from "@/app/crm/quotes/helpers";
import { photoDataUrls } from "@/app/crm/quotes/photo-storage";

/**
 * The operator's copy of a quote PDF.
 *
 * An ISSUED quote streams the stored artefact — the exact bytes the client
 * received. Re-rendering it here would quietly produce a different document the
 * day a font, a setting or a rounding rule changed, and the whole point of
 * storing it is that the record and the client's inbox never diverge.
 *
 * A draft has no stored artefact by definition, so it is rendered on the fly and
 * NOT stored: writing it would create an artefact for a document that has not
 * been issued, which is exactly the confusion `pdf_path` exists to avoid.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not authorised", { status: 401 });

  const { id } = await params;

  const detail = await getQuote(id);
  if (!detail) return new NextResponse("Quote not found", { status: 404 });

  let pdf: Buffer | null = detail.quote.pdf_path
    ? await readQuotePdf(detail.quote.pdf_path)
    : null;

  if (!pdf) {
    const settings = await getSettings();

    // Every line, resolved by the renderer rather than here. It picks the tier
    // the client accepted — falling back to the cheapest offered — and prints
    // the extras still on the table. Pre-resolving to the cheapest tier would
    // hand the operator a PDF understating a quote the client accepted on the
    // dearer option, and would drop the extras from all of them.
    pdf = await renderQuotePdf({
      quote: detail.quote,
      client: detail.client,
      settings,
      items: detail.items,
      clauses: detail.clauses,
      photos: detail.quote.include_photos ? await photoDataUrls(detail.photos) : [],
    });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(pdf.byteLength),
      "content-disposition": `attachment; filename="${pdfFilename(detail.quote)}"`,
      // A quote's contents can change until it is issued, and an issued one is
      // private to the operator either way.
      "cache-control": "private, no-store",
    },
  });
}
