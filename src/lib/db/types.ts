/**
 * Domain types mirroring supabase/migrations. Hand-written rather than
 * generated so the phase does not depend on a live Supabase project; once one
 * exists, `supabase gen types typescript` can replace this file wholesale.
 *
 * Money is integer cents everywhere. Never store or compute money as a float.
 */

export type Role = "owner" | "estimator" | "crew" | "readonly";
export type ItemKind = "material" | "labour";
export type ClauseKind = "inclusion" | "exclusion";

export type QuoteStatus =
  | "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "superseded";

export type StageId =
  | "enquiry" | "qualified" | "visit_booked" | "quoted" | "won" | "lost";

export type LostReason =
  | "price" | "timing" | "went_elsewhere" | "no_response" | "cancelled";

export type ActivityKind = "note" | "call" | "email" | "sms" | "visit" | "task";
export type JobStatus = "scheduled" | "in_progress" | "on_hold" | "complete" | "cancelled";
export type InvoiceKind = "deposit" | "progress" | "final";
export type InvoiceStatus = "draft" | "sent" | "part_paid" | "paid" | "void";
export type PaymentMethod = "stripe" | "bank_transfer" | "cash" | "other";

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  property_address: string | null;
  lat: number | null;
  lng: number | null;
  source: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Opportunity {
  id: string;
  client_id: string;
  stage_id: StageId;
  title: string | null;
  roof_type: string | null;
  lost_reason: LostReason | null;
  visit_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Activity {
  id: string;
  client_id: string | null;
  opportunity_id: string | null;
  quote_id: string | null;
  kind: ActivityKind;
  body: string | null;
  due_at: string | null;
  done_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Quote {
  id: string;
  opportunity_id: string | null;
  client_id: string;
  /** Null until issued — the UI shows "DRAFT". */
  quote_number: string | null;
  status: QuoteStatus;
  parent_quote_id: string | null;
  version: number;
  roof_type: string | null;
  notes: string | null;
  valid_days: number;
  show_breakdown: boolean;
  pdf_layout: "classic" | "modern";
  /** Markup applied to cost to reach the client-facing price. */
  margin_pct: number;
  gst_enabled: boolean;
  gst_rate: number;
  include_photos: boolean;
  /** Frozen at issue. Null on drafts. */
  subtotal_cents: number | null;
  total_cents: number | null;
  pdf_path: string | null;
  portal_token: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  signed_name: string | null;
  signed_at: string | null;
  signed_ip: string | null;
  created_by: string | null;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  /** Supplier COST. The client-facing document marks this up by margin_pct. */
  unit_cost_cents: number;
  is_optional: boolean;
  tier: "good" | "better" | "best" | null;
  sort: number;
}

export interface QuoteClause {
  id: string;
  quote_id: string;
  kind: ClauseKind;
  text: string;
  sort: number;
}

export interface QuotePhoto {
  id: string;
  quote_id: string;
  storage_path: string;
  caption: string | null;
  sort: number;
}

export interface PriceBookItem {
  id: string;
  kind: ItemKind;
  category: string;
  description: string;
  unit: string;
  unit_cost_cents: number;
  supplier: string | null;
  supplier_sku: string | null;
  /** Restamped only when the cost changes — drives the staleness flag. */
  cost_updated_at: string;
  archived_at: string | null;
  created_at: string;
}

export interface Snippet {
  id: string;
  kind: ClauseKind;
  text: string;
  is_default: boolean;
  sort: number;
  created_at: string;
}

export interface JobTemplate {
  id: string;
  label: string;
  sub: string | null;
  icon: string | null;
  roof_type: string | null;
  valid_days: number | null;
  margin_pct: number | null;
  show_breakdown: boolean;
  notes: string | null;
  line_items: TemplateLineItem[];
  sort: number;
  archived_at: string | null;
  created_at: string;
}

export interface TemplateLineItem {
  kind: ItemKind;
  description: string;
  qty: number;
  unit: string;
  unit_cost_cents: number;
}

export interface Settings {
  id: 1;
  business_name: string | null;
  legal_name: string | null;
  owner_name: string | null;
  licence_no: string | null;
  abn: string | null;
  acn: string | null;
  phone: string | null;
  email: string | null;
  site: string | null;
  address: string | null;
  logo_path: string | null;
  /** Master switch — gates the per-quote gst_enabled toggle. */
  gst_registered: boolean;
  gst_rate: number;
  deposit_enabled: boolean;
  deposit_pct: number;
  default_margin_pct: number;
  default_valid_days: number;
  margin_floor_pct: number;
  follow_up_days: number;
  /** Owner-supplied or professionally reviewed. Never generated. */
  payment_terms: string | null;
  updated_at: string;
}

export interface Job {
  id: string;
  quote_id: string;
  status: JobStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_at: string | null;
  crew_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  job_id: string | null;
  quote_id: string | null;
  invoice_number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  total_cents: number;
  due_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  stripe_payment_intent: string | null;
  xero_invoice_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: PaymentMethod;
  reference: string | null;
  received_at: string;
  created_by: string | null;
}
