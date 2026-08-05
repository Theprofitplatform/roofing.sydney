/**
 * Server-side render of the issued quote PDF.
 *
 * Deliberately thin: a route handler imports this, so anything heavy or
 * stateful added here lands in the request path. `@react-pdf/renderer` is used
 * instead of headless Chromium because the app ships in a node:22-alpine
 * container — bundling a browser would add hundreds of megabytes and a remote
 * code surface to produce one A4 page.
 */

import { renderToBuffer } from "@react-pdf/renderer";

import { QuoteDocument, type QuotePdfInput } from "./quote-document.tsx";

export type { QuotePdfInput };

/**
 * Renders to a Node Buffer, ready to write to storage or stream to the client.
 *
 * The issued PDF is an artefact stored once, not a live re-render, so a partial
 * input must fail here rather than produce a document with a blank party block.
 */
export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  if (!input?.quote) throw new TypeError("renderQuotePdf: quote is required");
  if (!input.client) throw new TypeError("renderQuotePdf: client is required");
  if (!input.settings) throw new TypeError("renderQuotePdf: settings is required");
  if (!Array.isArray(input.items)) throw new TypeError("renderQuotePdf: items must be an array");
  if (!Array.isArray(input.clauses)) throw new TypeError("renderQuotePdf: clauses must be an array");

  return renderToBuffer(QuoteDocument(input));
}
