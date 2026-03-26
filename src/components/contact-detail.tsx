"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Mail,
  Phone,
  Calendar,
  DollarSign,
  ShoppingCart,
  Package,
  Clock,
  User,
  ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Contact {
  id: string;
  hubspot_contact_id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  lifecycle_stage: string;
  first_conversion_date: string | null;
  recent_conversion_date: string | null;
}

interface ChargeProduct {
  id: string;
  name: string;
  short_name: string;
  group_name: string | null;
  product_type: string;
  program: string | null;
}

interface Charge {
  id: string;
  amount: number;
  charge_date: string;
  raw_title: string;
  product_variant: string;
  source_platform: string;
  payment_plan_type: string | null;
  subscription_status: string | null;
  refund_amount: number | null;
  refund_date: string | null;
  is_new_purchase: boolean | null;
  products: ChargeProduct | null;
}

interface Meeting {
  id: string;
  title: string;
  meeting_date: string;
  duration_minutes: number;
  outcome: string;
  outcome_notes: string;
  sales_reps: { id: string; name: string } | null;
}

interface StudentEnrollment {
  id: string;
  name: string;
  program: string;
  status: string;
  coach: string;
  member_type: string;
  signup_date: string;
  monthly_revenue: number;
  payment_plan: string;
}

interface ProductSummary {
  name: string;
  group: string | null;
  count: number;
  total: number;
}

interface ContactData {
  contact: Contact;
  charges: Charge[];
  meetings: Meeting[];
  students: StudentEnrollment[];
  summary: {
    total_charges: number;
    total_spend: number;
    total_refunds: number;
    net_revenue: number;
    first_purchase: string | null;
    last_purchase: string | null;
    products: ProductSummary[];
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const fmtDateShort = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });

const platformColors: Record<string, string> = {
  hubspot: "bg-amber-500/10 text-amber-400",
  samcart: "bg-blue-500/10 text-blue-400",
  kajabi: "bg-purple-500/10 text-purple-400",
};

const fmtDateTime = (s: string) => {
  const d = new Date(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};

const OUTCOME_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:       { bg: "bg-zinc-500/15",   text: "text-zinc-400",   label: "Pending" },
  completed:     { bg: "bg-blue-500/15",   text: "text-blue-400",   label: "Completed" },
  no_show:       { bg: "bg-red-500/15",    text: "text-red-400",    label: "No Show" },
  rescheduled:   { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "Rescheduled" },
  not_qualified: { bg: "bg-orange-500/15", text: "text-orange-400", label: "Not Qualified" },
  lead:          { bg: "bg-cyan-500/15",   text: "text-cyan-400",   label: "Lead" },
  sold:          { bg: "bg-green-500/15",  text: "text-green-400",  label: "Sold" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active:     { bg: "bg-green-500/15",  text: "text-green-400" },
  cancelled:  { bg: "bg-red-500/15",    text: "text-red-400" },
  paused:     { bg: "bg-amber-500/15",  text: "text-amber-400" },
  downgraded: { bg: "bg-orange-500/15", text: "text-orange-400" },
};

const PRODUCT_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#3b82f6",
  "#ef4444", "#a855f7", "#14b8a6", "#f97316",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ContactDetailProps {
  contactId: string;
  onClose: () => void;
}

export function ContactDetail({ contactId, onClose }: ContactDetailProps) {
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchContact = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}`);
      if (!res.ok) return;
      const json: ContactData = await res.json();
      setData(json);
    } catch (err) {
      console.error("[ContactDetail] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col border-l border-border bg-background shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              {loading ? (
                <div className="h-5 w-32 animate-pulse rounded bg-muted/30" />
              ) : (
                <>
                  <h2 className="text-sm font-semibold">
                    {data?.contact.full_name || "Unknown"}
                  </h2>
                  {data?.contact.email && (
                    <p className="text-xs text-muted-foreground">
                      {data.contact.email}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {data?.contact.hubspot_contact_id && (
              <a
                href={`https://app.hubspot.com/contacts/${data.contact.hubspot_contact_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="View in HubSpot"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto">
            {/* Contact Info */}
            <div className="border-b border-border px-5 py-4">
              <div className="grid grid-cols-2 gap-3">
                {data.contact.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {data.contact.phone}
                  </div>
                )}
                {data.contact.lifecycle_stage && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span className="capitalize">{data.contact.lifecycle_stage}</span>
                  </div>
                )}
                {data.contact.first_conversion_date && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    First: {fmtDate(data.contact.first_conversion_date)}
                  </div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="border-b border-border px-5 py-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                  <div className="text-base font-semibold text-emerald-400">
                    {fmtCurrency(data.summary.net_revenue)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Lifetime Value</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                  <div className="text-base font-semibold text-foreground">
                    {data.summary.total_charges}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Transactions</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-center">
                  <div className="text-base font-semibold text-foreground">
                    {data.summary.first_purchase
                      ? fmtDateShort(data.summary.first_purchase)
                      : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">First Purchase</div>
                </div>
              </div>
            </div>

            {/* Products Purchased */}
            {data.summary.products.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Products Purchased
                </h3>
                <div className="space-y-1.5">
                  {data.summary.products.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }}
                      />
                      <span className="flex-1 text-xs text-foreground">{p.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {p.count}x
                      </span>
                      <span className="w-20 text-right text-xs tabular-nums font-medium text-foreground">
                        {fmtCurrency(p.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Enrollments */}
            {data.students && data.students.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Enrollments
                </h3>
                <div className="space-y-2">
                  {data.students.map((s) => {
                    const statusStyle = STATUS_STYLES[s.status] || { bg: "bg-muted", text: "text-muted-foreground" };
                    return (
                      <div key={s.id} className="rounded-lg border border-border/50 bg-card/30 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground capitalize">{s.program}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusStyle.bg, statusStyle.text)}>
                            {s.status}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                          {s.signup_date && <span>Joined {fmtDate(s.signup_date)}</span>}
                          {s.coach && <span>Coach: {s.coach}</span>}
                          {s.member_type !== "student" && <span className="capitalize">{s.member_type}</span>}
                          {s.monthly_revenue > 0 && <span>{fmtCurrency(s.monthly_revenue)}/mo</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Meetings */}
            {data.meetings && data.meetings.length > 0 && (
              <div className="border-b border-border px-5 py-4">
                <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Meetings ({data.meetings.length})
                </h3>
                <div className="space-y-0">
                  {data.meetings.map((mtg, i) => {
                    const outcomeInfo = OUTCOME_STYLES[mtg.outcome] || { bg: "bg-muted", text: "text-muted-foreground", label: mtg.outcome };
                    const isLast = i === data.meetings.length - 1;

                    return (
                      <div key={mtg.id} className="flex gap-3">
                        {/* Timeline line + dot */}
                        <div className="flex flex-col items-center">
                          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400/60" />
                          {!isLast && <div className="w-px flex-1 bg-border/50" />}
                        </div>

                        {/* Content */}
                        <div className={cn("flex-1 pb-3", isLast && "pb-0")}>
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {mtg.title || "Meeting"}
                            </span>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", outcomeInfo.bg, outcomeInfo.text)}>
                              {outcomeInfo.label}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{fmtDateTime(mtg.meeting_date)}</span>
                            {mtg.sales_reps?.name && <span>with {mtg.sales_reps.name}</span>}
                            {mtg.duration_minutes > 0 && <span>{mtg.duration_minutes}min</span>}
                          </div>
                          {mtg.outcome_notes && (
                            <p className="mt-1 text-[10px] text-muted-foreground/70 italic">
                              {mtg.outcome_notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Charge Timeline */}
            <div className="px-5 py-4">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Transaction History
              </h3>
              <div className="space-y-0">
                {data.charges.map((charge, i) => {
                  const product = charge.products;
                  const isLast = i === data.charges.length - 1;

                  return (
                    <div key={charge.id} className="flex gap-3">
                      {/* Timeline line + dot */}
                      <div className="flex flex-col items-center">
                        <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                        {!isLast && (
                          <div className="w-px flex-1 bg-border/50" />
                        )}
                      </div>

                      {/* Content */}
                      <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-xs font-medium text-foreground">
                              {product?.short_name || product?.name || charge.product_variant || "Unknown Product"}
                            </span>
                            {product?.group_name && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                                {product.group_name}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs tabular-nums font-semibold text-foreground">
                            {fmtCurrency(Number(charge.amount))}
                          </span>
                        </div>

                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{fmtDate(charge.charge_date)}</span>
                          <span
                            className={cn(
                              "rounded px-1 py-0.5 text-[9px] font-medium",
                              platformColors[charge.source_platform] || "bg-muted text-muted-foreground"
                            )}
                          >
                            {charge.source_platform}
                          </span>
                          {charge.payment_plan_type && (
                            <span className="capitalize">{charge.payment_plan_type}</span>
                          )}
                          {charge.refund_amount && Number(charge.refund_amount) > 0 && (
                            <span className="text-red-400">
                              Refund: {fmtCurrency(Number(charge.refund_amount))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {data.charges.length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    No transactions found
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Contact not found</p>
          </div>
        )}
      </div>
    </>
  );
}
