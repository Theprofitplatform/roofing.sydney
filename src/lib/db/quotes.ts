import "server-only";
import { db, admin, unwrap, unwrapMaybe, unwrapList, DbError } from "./client";
import type {
  Client,
  Quote,
  QuoteClause,
  QuoteItem,
  QuotePhoto,
  QuoteSelection,
  ClauseKind,
  ItemKind,
  Tier,
} from "./types";

/**
 * Quote reads and writes.
 *
 * The one rule this module exists to protect: an issued quote is immutable. The
 * database enforces that with a trigger, so nothing here can quietly break it —
 * but the functions below are shaped so callers do not even try. Editing goes
 * through `updateQuote`/`replaceItems`, which only ever touch drafts; changing an
 * issued quote means `reviseQuote`, which raises a linked v2.
 */

/** A quote with everything needed to render or price it. */
export interface QuoteDetail {
  quote: Quote;
  client: Client;
  items: QuoteItem[];
  clauses: QuoteClause[];
  photos: QuotePhoto[];
  selections: QuoteSelection[];
}

/**
 * List row — carries items because the list prices every quote live.
 *
 * `id` and `tier` are not decoration. A quote can hold good/better/best variants
 * and client-selectable extras alongside its base scope, so pricing it means
 * resolving which of those lines are actually in play. Without the id there is no
 * way to match a recorded selection back to its line, and without the tier every
 * variant gets counted at once — which reads as a catastrophically low margin.
 */
export interface QuoteListRow {
  quote: Quote;
  client: Pick<Client, "id" | "name" | "email" | "phone" | "property_address">;
  items: Pick<QuoteItem, "id" | "kind" | "qty" | "unit_cost_cents" | "is_optional" | "tier">[];
  /** Line ids the client ticked on the portal. Empty until they accept. */
  selectedItemIds: string[];
}

const LIST_SELECT = `
  *,
  client:clients!inner (id, name, email, phone, property_address),
  items:quote_items (id, kind, qty, unit_cost_cents, is_optional, tier),
  selections:quote_selections (quote_item_id)
`;

type ListShape = Quote & {
  client: QuoteListRow["client"];
  items: QuoteListRow["items"];
  selections: { quote_item_id: string }[];
};

function toListRow({ client, items, selections, ...quote }: ListShape): QuoteListRow {
  return {
    quote: quote as Quote,
    client,
    items,
    selectedItemIds: (selections ?? []).map((s) => s.quote_item_id),
  };
}

/** Every quote, newest first. Volume is a single roofer's book of work. */
export async function listQuotes(): Promise<QuoteListRow[]> {
  const supabase = await db();
  const rows = unwrapList<ListShape>(
    "listQuotes",
    await supabase.from("quotes").select(LIST_SELECT).order("created_at", { ascending: false }),
  );
  return rows.map(toListRow);
}

/** Quotes for one client, newest first. */
export async function listQuotesForClient(clientId: string): Promise<QuoteListRow[]> {
  const supabase = await db();
  const rows = unwrapList<ListShape>(
    "listQuotesForClient",
    await supabase
      .from("quotes")
      .select(LIST_SELECT)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
  );
  return rows.map(toListRow);
}

const DETAIL_SELECT = `
  *,
  client:clients!inner (*),
  items:quote_items (*),
  clauses:quote_clauses (*),
  photos:quote_photos (*),
  selections:quote_selections (*)
`;

type DetailShape = Quote & {
  client: Client;
  items: QuoteItem[];
  clauses: QuoteClause[];
  photos: QuotePhoto[];
  selections: QuoteSelection[];
};

function toDetail(row: DetailShape): QuoteDetail {
  const { client, items, clauses, photos, selections, ...quote } = row;
  return {
    quote: quote as Quote,
    client,
    // Postgres does not guarantee child ordering through an embedded select.
    items: [...items].sort((a, b) => a.sort - b.sort),
    clauses: [...clauses].sort((a, b) => a.sort - b.sort),
    photos: [...photos].sort((a, b) => a.sort - b.sort),
    selections,
  };
}

export async function getQuote(id: string): Promise<QuoteDetail | null> {
  const supabase = await db();
  const row = unwrapMaybe<DetailShape>(
    "getQuote",
    await supabase.from("quotes").select(DETAIL_SELECT).eq("id", id).single(),
  );
  return row ? toDetail(row) : null;
}

/**
 * Portal read. Runs as the service role because the homeowner has no session —
 * the token in the URL is the credential. Scoped to a single row by token, so it
 * discloses nothing about any other quote even if the token is wrong.
 */
export async function getQuoteByPortalToken(token: string): Promise<QuoteDetail | null> {
  if (!token || token.length < 24) return null;
  const supabase = admin();
  const row = unwrapMaybe<DetailShape>(
    "getQuoteByPortalToken",
    await supabase.from("quotes").select(DETAIL_SELECT).eq("portal_token", token).single(),
  );
  return row ? toDetail(row) : null;
}

// ── Writes (drafts only — the database rejects the rest) ────────────────────

export interface NewQuoteInput {
  client_id: string;
  opportunity_id?: string | null;
  roof_type?: string | null;
  notes?: string | null;
  valid_days?: number;
  margin_pct?: number;
  show_breakdown?: boolean;
  pdf_layout?: "classic" | "modern";
  gst_enabled?: boolean;
  gst_rate?: number;
  include_photos?: boolean;
  created_by?: string | null;
}

export async function createQuote(input: NewQuoteInput): Promise<Quote> {
  const supabase = await db();
  return unwrap<Quote>(
    "createQuote",
    await supabase.from("quotes").insert(input).select("*").single(),
  );
}

/** Fields a draft may change. Everything omitted here is frozen or derived. */
export type QuotePatch = Partial<
  Pick<
    Quote,
    | "opportunity_id"
    | "roof_type"
    | "notes"
    | "valid_days"
    | "margin_pct"
    | "show_breakdown"
    | "pdf_layout"
    | "gst_enabled"
    | "gst_rate"
    | "include_photos"
    | "client_id"
  >
>;

export async function updateQuote(id: string, patch: QuotePatch): Promise<Quote> {
  const supabase = await db();
  return unwrap<Quote>(
    "updateQuote",
    await supabase.from("quotes").update(patch).eq("id", id).select("*").single(),
  );
}

export async function deleteQuote(id: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new DbError("deleteQuote", error);
}

export interface ItemInput {
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  unit_cost_cents: number;
  is_optional?: boolean;
  tier?: Tier | null;
}

/**
 * Replace the whole line-item set in one go.
 *
 * The builder edits a local array and saves it wholesale, so diffing rows here
 * would be complexity with no payoff. Delete-then-insert is correct for drafts;
 * on an issued quote the child-immutability trigger rejects both halves, which
 * is exactly the behaviour we want.
 */
export async function replaceItems(quoteId: string, items: ItemInput[]): Promise<void> {
  const supabase = await db();

  const { error: delError } = await supabase.from("quote_items").delete().eq("quote_id", quoteId);
  if (delError) throw new DbError("replaceItems/delete", delError);

  if (items.length === 0) return;

  const { error } = await supabase.from("quote_items").insert(
    items.map((item, index) => ({
      quote_id: quoteId,
      kind: item.kind,
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unit_cost_cents: item.unit_cost_cents,
      is_optional: item.is_optional ?? false,
      tier: item.tier ?? null,
      sort: index,
    })),
  );
  if (error) throw new DbError("replaceItems/insert", error);
}

export interface ClauseInput {
  kind: ClauseKind;
  text: string;
}

/**
 * Clauses are stored as resolved TEXT, not as references to the snippet library.
 * Editing a snippet next year must not silently rewrite a quote sent last year.
 */
export async function replaceClauses(quoteId: string, clauses: ClauseInput[]): Promise<void> {
  const supabase = await db();

  const { error: delError } = await supabase.from("quote_clauses").delete().eq("quote_id", quoteId);
  if (delError) throw new DbError("replaceClauses/delete", delError);

  if (clauses.length === 0) return;

  const { error } = await supabase.from("quote_clauses").insert(
    clauses.map((clause, index) => ({
      quote_id: quoteId,
      kind: clause.kind,
      text: clause.text,
      sort: index,
    })),
  );
  if (error) throw new DbError("replaceClauses/insert", error);
}

// ── Lifecycle (database functions — the guards live in Postgres) ────────────

/**
 * Issue: draw the number, freeze the totals, flip to sent. One statement, so two
 * devices pressing send at once cannot mint the same number.
 */
export async function issueQuote(
  quoteId: string,
  subtotalCents: number,
  totalCents: number,
): Promise<Quote> {
  const supabase = await db();
  return unwrap<Quote>(
    "issueQuote",
    await supabase
      .rpc("issue_quote", {
        p_quote_id: quoteId,
        p_subtotal_cents: subtotalCents,
        p_total_cents: totalCents,
      })
      .single(),
  );
}

/** Raise a linked v2 and supersede the parent. The companion to lock-on-issue. */
export async function reviseQuote(quoteId: string, createdBy?: string | null): Promise<Quote> {
  const supabase = await db();
  return unwrap<Quote>(
    "reviseQuote",
    await supabase
      .rpc("revise_quote", { p_quote_id: quoteId, p_created_by: createdBy ?? null })
      .single(),
  );
}

/** Record the stored PDF. Allowed on an issued quote — it is not commercial content. */
export async function setPdfPath(quoteId: string, pdfPath: string): Promise<void> {
  const supabase = await db();
  const { error } = await supabase.from("quotes").update({ pdf_path: pdfPath }).eq("id", quoteId);
  if (error) throw new DbError("setPdfPath", error);
}

/**
 * The whole revision chain this quote belongs to, oldest version first.
 *
 * `parent_quote_id` points one step back, so a single query around the given
 * quote finds its parent and its children but not its grandparent. On a v3 that
 * silently hid v1 — the original the client was actually sent. Walking to the
 * root first and then collecting forwards costs a couple of round trips on a
 * chain that is almost always one or two links long, and it cannot lie.
 */
export async function listRevisions(quoteId: string): Promise<Quote[]> {
  const supabase = await db();

  const byId = new Map<string, Quote>();

  const fetchOne = async (id: string): Promise<Quote | null> =>
    unwrapMaybe<Quote>(
      "listRevisions/walk",
      await supabase.from("quotes").select("*").eq("id", id).single(),
    );

  let current = await fetchOne(quoteId);
  if (!current) return [];

  // Walk back to the original. The guard is against a cycle that should be
  // impossible — a parent pointer is only ever set to an existing older row —
  // but an infinite loop here would hang the quote page, so it is cheap insurance.
  while (current.parent_quote_id && !byId.has(current.id)) {
    byId.set(current.id, current);
    const parent = await fetchOne(current.parent_quote_id);
    if (!parent) break;
    current = parent;
  }
  byId.set(current.id, current);

  // Then forwards from the root, collecting every descendant.
  const chain = new Map<string, Quote>([[current.id, current]]);
  let frontier = [current.id];

  while (frontier.length > 0) {
    const children = unwrapList<Quote>(
      "listRevisions/children",
      await supabase.from("quotes").select("*").in("parent_quote_id", frontier),
    );
    frontier = [];
    for (const child of children) {
      if (chain.has(child.id)) continue;
      chain.set(child.id, child);
      frontier.push(child.id);
    }
  }

  return [...chain.values()].sort(
    (a, b) => a.version - b.version || a.created_at.localeCompare(b.created_at),
  );
}
