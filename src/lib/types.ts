// ---------------------------------------------------------------------------
// Mission Control -- Core TypeScript types
// ---------------------------------------------------------------------------

/** Kanban column identifiers. Order matches the physical board layout. */
export type ColumnId = 'inbox' | 'todo' | 'in_progress' | 'blocked' | 'done';

/** Priority levels -- p1 is most urgent, p4 is lowest. */
export type Priority = 'p1' | 'p2' | 'p3' | 'p4';

/** Top-level navigation views. */
export type View =
  | 'dashboard'
  | 'kanban'
  | 'roadmap'
  | 'financials'
  | 'project_detail'
  | 'assets'
  | 'tooling'
  | 'archive'
  | 'sales'
  | 'charges'
  | 'calendar'
  | 'students'
  | 'marketing'
  | 'meetings'
  | 'sync_health';

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

export type ProjectType = 'client' | 'internal' | 'tooling';
export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  project_type: ProjectType;
  status: ProjectStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  card_count: number;
  active_card_count: number;
  asset_count: number;
}

// ---------------------------------------------------------------------------
// Asset types
// ---------------------------------------------------------------------------

export type AssetType =
  | 'page'
  | 'funnel'
  | 'email_sequence'
  | 'content'
  | 'skill'
  | 'agent'
  | 'mcp_server'
  | 'other';

export type AssetStatus = 'active' | 'draft' | 'archived' | 'in_development';

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  description: string;
  url: string;
  asset_type: AssetType;
  status: AssetStatus;
  performance_notes: string;
  screenshot_url: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetWithRelations extends Asset {
  linked_cards: Card[];
  tooling_metadata: ToolingMetadata | null;
  project_name: string;
  project_color: string;
}

// ---------------------------------------------------------------------------
// Asset-Card link
// ---------------------------------------------------------------------------

export interface AssetLink {
  id: string;
  asset_id: string;
  card_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Tooling metadata (Claude tooling project type)
// ---------------------------------------------------------------------------

export type UsageFrequency = 'daily' | 'weekly' | 'occasional' | 'rare' | 'unknown';

export interface ToolingMetadata {
  id: string;
  asset_id: string;
  repo_path: string;
  usage_frequency: UsageFrequency;
  last_used_at: string | null;
  optimization_notes: string;
  dependencies: string[];
  created_at: string;
  updated_at: string;
}

export interface ToolingAsset extends Asset {
  metadata: ToolingMetadata;
  project_name: string;
}

// ---------------------------------------------------------------------------
// Financial types
// ---------------------------------------------------------------------------

export type EntryType = 'income' | 'expense';
export type IncomeCategory = 'elite' | 'accelerator' | 'private_client_experience' | 'coaching' | 'other_income';
export type ExpenseCategory = 'software' | 'tools' | 'contractor' | 'marketing' | 'hosting' | 'other_expense';
export type FinancialCategory = IncomeCategory | ExpenseCategory;

export interface FinancialEntry {
  id: string;
  project_id: string | null;
  entry_type: EntryType;
  amount: number;
  description: string;
  category: string;
  entry_date: string;
  recurring: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Revenue snapshot (monthly product revenue tracking)
// ---------------------------------------------------------------------------

export interface RevenueSnapshot {
  id: string;
  product_name: string;
  month: string; // YYYY-MM
  amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Budget target (monthly income/expense targets)
// ---------------------------------------------------------------------------

export interface BudgetTarget {
  id: string;
  month: string; // YYYY-MM
  target_income: number;
  target_expense: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Rep sales (sales rep monthly tracking)
// ---------------------------------------------------------------------------

export interface RepSale {
  id: string;
  rep_name: string;
  month: string; // YYYY-MM
  product: string;
  amount: number;
  new_amount: number;
  recurring_amount: number;
  deal_count: number;
  booked_calls: number;
  refund_amount: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Calendar event types
// ---------------------------------------------------------------------------

export type EventType = 'mastermind' | 'sabbath' | 'vacation' | 'challenge' | 'holiday' | 'deadline' | 'custom';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD, null = single day
  event_type: EventType;
  color: string; // hex override, empty = use event type default
  all_day: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventTypeConfig {
  label: string;
  color: string;
  icon: string;
}

export const EVENT_TYPE_CONFIG: Record<EventType, EventTypeConfig> = {
  mastermind: { label: 'Mastermind', color: '#a855f7', icon: 'Users' },
  sabbath:    { label: 'Sabbath',    color: '#3b82f6', icon: 'Moon' },
  vacation:   { label: 'Vacation',   color: '#22c55e', icon: 'Palmtree' },
  challenge:  { label: 'Challenge',  color: '#f59e0b', icon: 'Flame' },
  holiday:    { label: 'Holiday',    color: '#ef4444', icon: 'Flag' },
  deadline:   { label: 'Deadline',   color: '#f97316', icon: 'Clock' },
  custom:     { label: 'Custom',     color: '#6366f1', icon: 'CalendarDays' },
} as const;

// ---------------------------------------------------------------------------
// Student tracking types
// ---------------------------------------------------------------------------

export type StudentProgram = 'elite' | 'accelerator';
export type StudentStatus = 'active' | 'cancelled' | 'paused' | 'downgraded';
export type ChurnType = 'cancel' | 'downgrade' | 'pause' | 'restart';
export type SessionType = 'workshop' | 'mastermind';

export type PaymentPlan = 'monthly' | 'quarterly' | 'annual' | 'annual_3pay' | '90_day' | '';

export const PAYMENT_PLAN_CONFIG: Record<string, { label: string; shortLabel: string }> = {
  monthly:     { label: 'Monthly',       shortLabel: 'Mo'  },
  quarterly:   { label: 'Quarterly',     shortLabel: 'Qtr' },
  annual:      { label: 'Annual',        shortLabel: 'Yr'  },
  annual_3pay: { label: 'Annual 3 Pay',  shortLabel: '3Py' },
  '90_day':    { label: '90 Day',        shortLabel: '90d' },
} as const;

export interface Student {
  id: string;
  contact_id: string | null;
  name: string;
  email: string;
  youtube_channel: string;
  coach: string;
  program: StudentProgram;
  monthly_revenue: number;
  signup_date: string;
  status: StudentStatus;
  payment_plan: PaymentPlan;
  renewal_date: string;
  notes: string;
  switch_requested_to: string;
  switch_requested_date: string;
  created_at: string;
  updated_at: string;
}

export interface ChurnEvent {
  id: string;
  student_id: string;
  student_name?: string; // joined from students table
  event_type: ChurnType;
  event_date: string;
  reason: string;
  monthly_revenue_impact: number;
  coach: string;
  notes: string;
  created_at: string;
}

export interface EliteSession {
  id: string;
  title: string;
  session_type: SessionType;
  session_date: string;
  facilitator: string;
  notes: string;
  attendance_count?: number; // computed
  total_students?: number;   // computed
  created_at: string;
  updated_at: string;
}

export interface EliteAttendance {
  id: string;
  session_id: string;
  student_id: string;
  student_name?: string; // joined
  attended: boolean;
  notes: string;
  created_at: string;
}

export const STUDENT_PROGRAM_CONFIG: Record<StudentProgram, { label: string; color: string }> = {
  elite:       { label: 'Elite',       color: '#a855f7' },
  accelerator: { label: 'Accelerator', color: '#3b82f6' },
} as const;

export const STUDENT_STATUS_CONFIG: Record<StudentStatus, { label: string; color: string }> = {
  active:     { label: 'Active',     color: '#22c55e' },
  cancelled:  { label: 'Cancelled',  color: '#ef4444' },
  paused:     { label: 'Paused',     color: '#f59e0b' },
  downgraded: { label: 'Downgraded', color: '#f97316' },
} as const;

export const CHURN_TYPE_CONFIG: Record<ChurnType, { label: string; color: string }> = {
  cancel:    { label: 'Cancelled',  color: '#ef4444' },
  downgrade: { label: 'Downgraded', color: '#f97316' },
  pause:     { label: 'Paused',     color: '#f59e0b' },
  restart:   { label: 'Restarted',  color: '#2dd4bf' },
} as const;

// ---------------------------------------------------------------------------
// Coach capacity types
// ---------------------------------------------------------------------------

export type CoachStatus = 'active' | 'limited' | 'inactive';

export interface CoachCapacity {
  id: string;
  coach_name: string;
  max_students: number;
  preferred_max: number;
  status: CoachStatus;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CoachCapacityDetail extends CoachCapacity {
  active_students: number;
}

export interface CapacityProjection {
  month: string;      // YYYY-MM
  label: string;      // "Mar 2026"
  projected_students: number;
  total_capacity: number;
  preferred_capacity: number;
}

export interface CapacityForecast {
  coaches: CoachCapacityDetail[];
  projections: CapacityProjection[];
  current_active: number;
  total_capacity: number;
  preferred_capacity: number;
  available_slots: number;
  utilization_pct: number;
  avg_monthly_signups: number;
  avg_monthly_churn: number;
  net_monthly_growth: number;
  months_of_data: number;
  capacity_full_date: string | null;     // YYYY-MM
  preferred_full_date: string | null;    // YYYY-MM
  post_job_date: string | null;          // YYYY-MM-DD (hire_by - 42 days)
  hire_by_date: string | null;           // YYYY-MM-DD (capacity_full - 90 days)
}

export const COACH_STATUS_CONFIG: Record<CoachStatus, { label: string; color: string }> = {
  active:   { label: 'Active',   color: '#22c55e' },
  limited:  { label: 'Limited',  color: '#f59e0b' },
  inactive: { label: 'Inactive', color: '#6c7086' },
} as const;

// ---------------------------------------------------------------------------
// MRR / Revenue Intelligence types
// ---------------------------------------------------------------------------

export interface MrrMonth {
  month: string;
  total_mrr: number;
  elite_mrr: number;
  accelerator_mrr: number;
  student_count: number;
  elite_count: number;
  accelerator_count: number;
}

export interface RevenueTier {
  range: string;
  count: number;
  mrr: number;
}

export interface RevenueConcentration {
  top_5_pct: number;
  top_10_pct: number;
  avg_revenue: number;
  median_revenue: number;
  revenue_tiers: RevenueTier[];
}

export interface MrrHistoryResponse {
  months: MrrMonth[];
  concentration: RevenueConcentration;
}

// ---------------------------------------------------------------------------
// Domain models
// ---------------------------------------------------------------------------

export interface Card {
  id: string;
  title: string;
  description: string;
  column_id: ColumnId;
  priority: Priority;
  category: string;
  project_id: string | null;
  due_date: string | null;
  roadmap_id: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface ActivityEntry {
  id: string;
  card_id: string | null;
  asset_id: string | null;
  project_id: string | null;
  action: string;
  details: string;
  card_title?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Board configuration
// ---------------------------------------------------------------------------

export interface Column {
  id: ColumnId;
  title: string;
  icon: string;
  color: string;
}

export const COLUMNS: Column[] = [
  { id: 'inbox', title: 'Inbox', icon: 'Inbox', color: 'text-zinc-400' },
  { id: 'todo', title: 'To Do', icon: 'Circle', color: 'text-blue-400' },
  { id: 'in_progress', title: 'In Progress', icon: 'Timer', color: 'text-amber-400' },
  { id: 'blocked', title: 'Blocked', icon: 'AlertCircle', color: 'text-red-400' },
  { id: 'done', title: 'Done', icon: 'CheckCircle2', color: 'text-emerald-400' },
] as const;

// ---------------------------------------------------------------------------
// Priority visual config
// ---------------------------------------------------------------------------

export interface PriorityConfig {
  label: string;
  color: string;
  borderColor: string;
}

export const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  p1: { label: 'Critical', color: 'text-red-400', borderColor: 'border-l-red-500' },
  p2: { label: 'High', color: 'text-orange-400', borderColor: 'border-l-orange-500' },
  p3: { label: 'Medium', color: 'text-blue-400', borderColor: 'border-l-blue-500' },
  p4: { label: 'Low', color: 'text-zinc-500', borderColor: 'border-l-zinc-600' },
} as const;

// ---------------------------------------------------------------------------
// Asset type visual config
// ---------------------------------------------------------------------------

export interface AssetTypeConfig {
  label: string;
  icon: string;
  color: string;
}

export const ASSET_TYPE_CONFIG: Record<AssetType, AssetTypeConfig> = {
  page:           { label: 'Page',           icon: 'FileText',  color: 'text-blue-400' },
  funnel:         { label: 'Funnel',         icon: 'GitBranch', color: 'text-purple-400' },
  email_sequence: { label: 'Email Sequence', icon: 'Mail',      color: 'text-amber-400' },
  content:        { label: 'Content',        icon: 'PenSquare', color: 'text-emerald-400' },
  skill:          { label: 'Skill',          icon: 'Wand2',     color: 'text-cyan-400' },
  agent:          { label: 'Agent',          icon: 'Bot',       color: 'text-indigo-400' },
  mcp_server:     { label: 'MCP Server',     icon: 'Server',    color: 'text-orange-400' },
  other:          { label: 'Other',          icon: 'Package',   color: 'text-zinc-400' },
} as const;

export const ASSET_STATUS_CONFIG: Record<AssetStatus, { label: string; color: string }> = {
  active:         { label: 'Active',  color: 'text-emerald-400' },
  draft:          { label: 'Draft',   color: 'text-zinc-400' },
  archived:       { label: 'Archived', color: 'text-zinc-600' },
  in_development: { label: 'In Dev',  color: 'text-amber-400' },
} as const;

// ---------------------------------------------------------------------------
// Project type config
// ---------------------------------------------------------------------------

export const PROJECT_TYPE_CONFIG: Record<ProjectType, { label: string; icon: string }> = {
  client:   { label: 'Client',   icon: 'Users' },
  internal: { label: 'Internal', icon: 'Home' },
  tooling:  { label: 'Tooling',  icon: 'Bot' },
} as const;

// ---------------------------------------------------------------------------
// Financial category config
// ---------------------------------------------------------------------------

export const INCOME_CATEGORIES: Record<IncomeCategory, string> = {
  elite:                      'Elite',
  accelerator:                'Accelerator',
  private_client_experience:  'Private Client Experience',
  coaching:                   'Coaching',
  other_income:               'Other',
} as const;

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  software:      'Software',
  tools:         'Tools',
  contractor:    'Contractor',
  marketing:     'Marketing',
  hosting:       'Hosting',
  other_expense: 'Other',
} as const;

// ---------------------------------------------------------------------------
// Recurring card templates
// ---------------------------------------------------------------------------

export type Recurrence = 'weekly' | 'biweekly' | 'monthly';

export interface CardTemplate {
  id: string;
  title: string;
  description: string;
  project_id: string | null;
  priority: Priority;
  category: string;
  recurrence: Recurrence;
  day_of_month: number;
  day_of_week: number;
  active: boolean;
  last_generated: string | null;
  created_at: string;
  updated_at: string;
}

export const RECURRENCE_CONFIG: Record<Recurrence, { label: string; color: string }> = {
  weekly: { label: 'Weekly', color: '#89b4fa' },
  biweekly: { label: 'Biweekly', color: '#cba6f7' },
  monthly: { label: 'Monthly', color: '#a6e3a1' },
};

export const DAY_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Marketing funnel types (Jake Berman)
// ---------------------------------------------------------------------------

export type CohortStatus = 'upcoming' | 'active' | 'completed';
export type LeadSource = 'free_book' | 'warm_up' | 'organic' | 'ads' | 'other';

export interface MarketingCohort {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  status: CohortStatus;
  enrolled: number;
  converted_yearly: number;
  converted_monthly: number;
  coaching_upsells: number;
  revenue_cohort: number;
  revenue_yearly: number;
  revenue_monthly: number;
  revenue_coaching: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MarketingWebClass {
  id: string;
  class_date: string; // YYYY-MM-DD
  attendees: number;
  signups_to_cohort: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface MarketingLead {
  id: string;
  source: LeadSource;
  count: number;
  period: string; // YYYY-MM
  notes: string;
  created_at: string;
}

export const LEAD_SOURCE_CONFIG: Record<LeadSource, { label: string; color: string }> = {
  free_book: { label: 'Free Book',         color: '#89b4fa' },
  warm_up:   { label: 'Senior Golf Warm-up', color: '#a6e3a1' },
  organic:   { label: 'Organic Content',   color: '#f9e2af' },
  ads:       { label: 'Paid Ads',          color: '#cba6f7' },
  other:     { label: 'Other',             color: '#fab387' },
} as const;

export const COHORT_STATUS_CONFIG: Record<CohortStatus, { label: string; color: string }> = {
  upcoming:  { label: 'Upcoming',  color: '#89b4fa' },
  active:    { label: 'Active',    color: '#a6e3a1' },
  completed: { label: 'Completed', color: '#6c7086' },
} as const;

/** The funnel stages for the pipeline visualization. */
// ---------------------------------------------------------------------------
// Rep quota (sales target tracking)
// ---------------------------------------------------------------------------

export interface RepQuota {
  id: string;
  rep_name: string;
  month: string;
  target_amount: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Deal (individual deal-level data)
// ---------------------------------------------------------------------------

export interface Deal {
  id: string;
  rep_name: string;
  product: string;
  client_name: string;
  amount: number;
  deal_date: string;
  month: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export const FUNNEL_STAGES = [
  { id: 'leads',      label: 'Lead Magnets',           color: '#89b4fa', description: 'Free Book, Warm-up, Organic, Ads' },
  { id: 'web_class',  label: 'Web Class',              color: '#a6e3a1', description: 'Live Zoom every 2 weeks' },
  { id: 'cohort',     label: '10 Yards in 30 Days',    color: '#f9e2af', description: '4-week paid cohort' },
  { id: 'clubhouse',  label: 'Berman Clubhouse',       color: '#cba6f7', description: '$297/yr or $47/mo' },
  { id: 'coaching',   label: '1:1 Golf Coaching',      color: '#fab387', description: '$297 per session' },
] as const;
