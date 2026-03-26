"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Check,
  Loader2,
  AlertTriangle,
  UserX,
  Users,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingCancellation {
  student_id: string;
  student_name: string;
  email: string;
  program: string;
  coach: string;
  monthly_revenue: number;
  cancellation_source: string;
  cancellation_date: string;
  journey_event_id: string;
}

interface UnclassifiedStudent {
  student_id: string;
  student_name: string;
  email: string;
  program: string;
  member_type: string;
}

interface StatusMismatch {
  student_id: string;
  student_name: string;
  mc_status: string;
  charge_status: string;
  last_charge_date: string;
}

interface DataQualityData {
  pending_cancellations: PendingCancellation[];
  unclassified: UnclassifiedStudent[];
  status_mismatches: StatusMismatch[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EnrollmentQualityProps {
  open: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

type Section = "cancellations" | "unclassified" | "mismatches";

export function EnrollmentQuality({ open, onClose, onUpdated }: EnrollmentQualityProps) {
  const [data, setData] = useState<DataQualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<Section | null>("cancellations");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inline churn confirm form state
  const [confirmingChurnId, setConfirmingChurnId] = useState<string | null>(null);
  const [churnReason, setChurnReason] = useState("");

  // Partner linking state
  const [linkingPartnerId, setLinkingPartnerId] = useState<string | null>(null);
  const [linkedEmail, setLinkedEmail] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/students/data-quality");
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[EnrollmentQuality] fetch:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  const handleAction = async (
    action: string,
    studentId: string,
    extra?: Record<string, unknown>
  ) => {
    setActionLoading(studentId);
    try {
      const res = await fetch("/api/students/data-quality/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, student_id: studentId, ...extra }),
      });

      if (!res.ok) {
        const err = await res.json();
        setSuccessMessage(`Error: ${err.error}`);
        return;
      }

      const labels: Record<string, string> = {
        confirm_churn: "Churn confirmed",
        dismiss: "Dismissed",
        mark_partner: "Marked as partner",
        mark_student: "Marked as student",
      };
      setSuccessMessage(labels[action] || "Done");
      setConfirmingChurnId(null);
      setChurnReason("");
      setLinkingPartnerId(null);
      setLinkedEmail("");
      await fetchData();
      onUpdated?.();
    } catch (err) {
      console.error("[EnrollmentQuality] action:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (!open) return null;

  const totalCount =
    (data?.pending_cancellations.length || 0) +
    (data?.unclassified.length || 0) +
    (data?.status_mismatches.length || 0);

  const sections: { id: Section; label: string; count: number; icon: typeof AlertTriangle }[] = [
    {
      id: "cancellations",
      label: "Pending Cancellations",
      count: data?.pending_cancellations.length || 0,
      icon: UserX,
    },
    {
      id: "unclassified",
      label: "Unclassified Contacts",
      count: data?.unclassified.length || 0,
      icon: Users,
    },
    {
      id: "mismatches",
      label: "Status Mismatches",
      count: data?.status_mismatches.length || 0,
      icon: ArrowRightLeft,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[5vh]">
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Enrollment Data Quality</h2>
            <p className="text-xs text-muted-foreground">
              {data
                ? totalCount === 0
                  ? "All clear"
                  : `${totalCount} item${totalCount !== 1 ? "s" : ""} need review`
                : "Loading..."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Section count badges */}
            {data && !loading && (
              <div className="flex items-center gap-1.5">
                {sections.map((s) =>
                  s.count > 0 ? (
                    <span
                      key={s.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        s.id === "cancellations" && "bg-red-500/15 text-red-400",
                        s.id === "unclassified" && "bg-amber-500/15 text-amber-400",
                        s.id === "mismatches" && "bg-blue-500/15 text-blue-400"
                      )}
                    >
                      {s.count}
                    </span>
                  ) : null
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Success banner */}
        {successMessage && (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5 shrink-0" />
            {successMessage}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : totalCount === 0 ? (
            <div className="py-12 text-center">
              <Check className="mx-auto h-8 w-8 text-emerald-500/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                All clear — no items need review
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sections.map((section) => {
                if (section.count === 0) return null;
                const isExpanded = expandedSection === section.id;
                const Icon = section.icon;

                return (
                  <div
                    key={section.id}
                    className="rounded-lg border border-border/40 bg-card/20"
                  >
                    {/* Section header */}
                    <button
                      onClick={() =>
                        setExpandedSection(isExpanded ? null : section.id)
                      }
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-card/40"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="text-xs font-medium text-foreground flex-1">
                        {section.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                          section.id === "cancellations" && "bg-red-500/15 text-red-400",
                          section.id === "unclassified" && "bg-amber-500/15 text-amber-400",
                          section.id === "mismatches" && "bg-blue-500/15 text-blue-400"
                        )}
                      >
                        {section.count}
                      </span>
                    </button>

                    {/* Section content */}
                    {isExpanded && (
                      <div className="border-t border-border/30 px-3 py-2 space-y-1">
                        {/* Pending Cancellations */}
                        {section.id === "cancellations" &&
                          data!.pending_cancellations.map((item) => (
                            <div
                              key={`${item.student_id}-${item.journey_event_id}`}
                              className="rounded-md border border-border/20 bg-card/10 px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground">
                                    {item.student_name}
                                  </p>
                                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                                    <span>{item.program}</span>
                                    {item.coach && <span>Coach: {item.coach}</span>}
                                    <span>{fmtCurrency(item.monthly_revenue)}/mo</span>
                                    <span>{formatDate(item.cancellation_date)}</span>
                                    <span className="text-muted-foreground/50">
                                      {item.cancellation_source}
                                    </span>
                                  </div>
                                </div>

                                {confirmingChurnId !== item.student_id && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => {
                                        setConfirmingChurnId(item.student_id);
                                        setChurnReason("");
                                      }}
                                      disabled={actionLoading === item.student_id}
                                      className="inline-flex items-center gap-1 rounded-md bg-red-600/80 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-red-600"
                                    >
                                      Confirm Churn
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleAction("dismiss", item.student_id, {
                                          journey_event_id: item.journey_event_id,
                                        })
                                      }
                                      disabled={actionLoading === item.student_id}
                                      className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card/40 hover:text-foreground"
                                    >
                                      {actionLoading === item.student_id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Dismiss"
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Inline churn confirm form */}
                              {confirmingChurnId === item.student_id && (
                                <div className="mt-2 flex items-end gap-2">
                                  <div className="flex-1">
                                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                      Reason (optional)
                                    </label>
                                    <input
                                      type="text"
                                      placeholder="e.g. Couldn't afford, not enough time..."
                                      value={churnReason}
                                      onChange={(e) => setChurnReason(e.target.value)}
                                      autoFocus
                                      className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
                                    />
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleAction("confirm_churn", item.student_id, {
                                        reason: churnReason,
                                        journey_event_id: item.journey_event_id,
                                      })
                                    }
                                    disabled={actionLoading === item.student_id}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
                                  >
                                    {actionLoading === item.student_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmingChurnId(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                        {/* Unclassified Contacts */}
                        {section.id === "unclassified" &&
                          data!.unclassified.map((item) => (
                            <div
                              key={item.student_id}
                              className="rounded-md border border-border/20 bg-card/10 px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground">
                                    {item.student_name}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                                    <span>{item.email}</span>
                                    <span>{item.program}</span>
                                  </div>
                                </div>

                                {linkingPartnerId !== item.student_id && (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() =>
                                        handleAction("mark_student", item.student_id)
                                      }
                                      disabled={actionLoading === item.student_id}
                                      className="inline-flex items-center gap-1 rounded-md bg-primary/80 px-2.5 py-1 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary"
                                    >
                                      {actionLoading === item.student_id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Student"
                                      )}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setLinkingPartnerId(item.student_id);
                                        setLinkedEmail("");
                                      }}
                                      disabled={actionLoading === item.student_id}
                                      className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card/40 hover:text-foreground"
                                    >
                                      Partner
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Partner linking form */}
                              {linkingPartnerId === item.student_id && (
                                <div className="mt-2 flex items-end gap-2">
                                  <div className="flex-1">
                                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                      Linked student email (optional)
                                    </label>
                                    <input
                                      type="email"
                                      placeholder="student@example.com"
                                      value={linkedEmail}
                                      onChange={(e) => setLinkedEmail(e.target.value)}
                                      autoFocus
                                      className="w-full rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
                                    />
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleAction("mark_partner", item.student_id, {
                                        linked_student_email: linkedEmail || undefined,
                                      })
                                    }
                                    disabled={actionLoading === item.student_id}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                                  >
                                    {actionLoading === item.student_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setLinkingPartnerId(null)}
                                    className="text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}

                        {/* Status Mismatches */}
                        {section.id === "mismatches" &&
                          data!.status_mismatches.map((item) => (
                            <div
                              key={item.student_id}
                              className="rounded-md border border-border/20 bg-card/10 px-3 py-2.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-medium text-foreground">
                                    {item.student_name}
                                  </p>
                                  <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                                    <span>
                                      MC:{" "}
                                      <span className="text-emerald-400">{item.mc_status}</span>
                                    </span>
                                    <span>
                                      Charges:{" "}
                                      <span className="text-red-400">{item.charge_status}</span>
                                    </span>
                                    <span>Last charge: {formatDate(item.last_charge_date)}</span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() =>
                                      handleAction("confirm_churn", item.student_id)
                                    }
                                    disabled={actionLoading === item.student_id}
                                    className="inline-flex items-center gap-1 rounded-md bg-red-600/80 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-red-600"
                                  >
                                    {actionLoading === item.student_id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Update to Cancelled"
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleAction("dismiss", item.student_id)
                                    }
                                    disabled={actionLoading === item.student_id}
                                    className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-card/40 hover:text-foreground"
                                  >
                                    Dismiss
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3">
          <p className="text-[10px] text-muted-foreground/50">
            Review incoming cancellations, classify contacts, and resolve status
            mismatches between Mission Control and payment data.
          </p>
        </div>
      </div>
    </div>
  );
}
