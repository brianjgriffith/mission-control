// Hand-written types matching the Supabase schema.
// These are used for TypeScript intellisense — not passed as generics to createClient.

export type user_role =
  | "admin"
  | "executive"
  | "sales_manager"
  | "sales_rep"
  | "marketing_lead"
  | "coaching_director"
  | "program_manager"
  | "custom_viewer";

export type meeting_outcome =
  | "pending"
  | "completed"
  | "no_show"
  | "rescheduled"
  | "not_qualified"
  | "lead"
  | "sold";

export type member_type = "student" | "partner" | "unclassified";

export type student_status = "active" | "cancelled" | "paused" | "downgraded";

// ---- Table row types ----

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: user_role;
  program_scope: string[] | null;
  avatar_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  short_name: string;
  product_type: string;
  program: string | null;
  default_price: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  hubspot_contact_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  first_conversion_date: string | null;
  recent_conversion_date: string | null;
  hubspot_owner_id: string | null;
  lifecycle_stage: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Charge {
  id: string;
  contact_id: string;
  hubspot_charge_id: string | null;
  samcart_transaction_id: string | null;
  product_id: string | null;
  raw_title: string;
  product_variant: string;
  amount: number;
  currency: string;
  source_platform: string;
  is_new_purchase: boolean | null;
  payment_plan_type: string | null;
  affiliate_id: string | null;
  affiliate_name: string | null;
  subscription_status: string | null;
  refund_amount: number | null;
  refund_date: string | null;
  pending_samcart_enrichment: boolean;
  charge_date: string;
  created_at: string;
  updated_at: string;
}

export interface SalesRep {
  id: string;
  name: string;
  email: string | null;
  user_id: string | null;
  samcart_affiliate_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  hubspot_meeting_id: string | null;
  sales_rep_id: string | null;
  contact_id: string | null;
  title: string;
  meeting_date: string;
  duration_minutes: number | null;
  booking_source: string;
  outcome: meeting_outcome;
  outcome_notes: string;
  outcome_tagged_by: string | null;
  outcome_tagged_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  contact_id: string | null;
  name: string;
  email: string;
  youtube_channel: string;
  coach: string;
  program: string;
  monthly_revenue: number;
  signup_date: string;
  status: student_status;
  payment_plan: string;
  renewal_date: string;
  notes: string;
  switch_requested_to: string;
  switch_requested_date: string;
  member_type: member_type;
  linked_student_id: string | null;
  hubspot_segment: string;
  classification_source: string;
  created_at: string;
  updated_at: string;
}

export interface Funnel {
  id: string;
  name: string;
  funnel_type: string;
  hubspot_list_id: string | null;
  is_active: boolean;
  discovered_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JourneyEvent {
  id: string;
  contact_id: string;
  event_type: string;
  event_date: string;
  funnel_id: string | null;
  product_id: string | null;
  charge_id: string | null;
  amount: number | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SyncLogEntry {
  id: string;
  workflow_name: string;
  status: string;
  records_processed: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  started_at: string;
  completed_at: string | null;
  triggered_by: string;
  created_at: string;
}
