"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  type MarketingCohort,
  type MarketingWebClass,
  type MarketingLead,
  type CohortStatus,
  FUNNEL_STAGES,
  LEAD_SOURCE_CONFIG,
  COHORT_STATUS_CONFIG,
  type LeadSource,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  Users,
  DollarSign,
  TrendingUp,
  CalendarDays,
  LayoutGrid,
  Plus,
  ChevronLeft,
  ChevronRight,
  Video,
  Trophy,
  X,
  Pencil,
  Check,
  Trash2,
} from "lucide-react";
import {
  format,
  parseISO,
  isAfter,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  differenceInDays,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  getMonth,
  getYear,
} from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";

// ---------------------------------------------------------------------------
// Marketing View -- "The Machine" Dashboard
// ---------------------------------------------------------------------------

// Helper to format currency
function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Types for forms
// ---------------------------------------------------------------------------

type EditingCohort = Partial<MarketingCohort> & { id: string };

interface NewCohortForm {
  name: string;
  start_date: string;
  end_date: string;
}

interface NewWebClassForm {
  class_date: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type MarketingTab = "dashboard" | "calendar" | "projections";

export function MarketingView() {
  const [activeTab, setActiveTab] = useState<MarketingTab>("dashboard");
  const [cohorts, setCohorts] = useState<MarketingCohort[]>([]);
  const [webClasses, setWebClasses] = useState<MarketingWebClass[]>([]);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [calMonth, setCalMonth] = useState(new Date());

  // Editing state
  const [editingCohortId, setEditingCohortId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditingCohort | null>(null);

  // Web class editing
  const [editingWebClassId, setEditingWebClassId] = useState<string | null>(null);
  const [wcEditForm, setWcEditForm] = useState<Partial<MarketingWebClass> & { id: string } | null>(null);

  // Lead editing
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [leadEditForm, setLeadEditForm] = useState<Partial<MarketingLead> & { id: string } | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState<{ source: string; count: number; period: string; notes: string }>({
    source: "organic", count: 0, period: format(new Date(), "yyyy-MM"), notes: "",
  });

  // Add forms
  const [showAddCohort, setShowAddCohort] = useState(false);
  const [newCohort, setNewCohort] = useState<NewCohortForm>({ name: "", start_date: "", end_date: "" });
  const [showAddWebClass, setShowAddWebClass] = useState(false);
  const [newWebClass, setNewWebClass] = useState<NewWebClassForm>({ class_date: "", notes: "" });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/marketing");
      if (!res.ok) return;
      const data = await res.json();
      setCohorts(data.cohorts ?? []);
      setWebClasses(data.webClasses ?? []);
      setLeads(data.leads ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Computed Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const totalLeads = leads.reduce((sum, l) => sum + l.count, 0);
    const totalWebClassAttendees = webClasses.reduce((sum, w) => sum + w.attendees, 0);
    const totalEnrolled = cohorts.reduce((sum, c) => sum + c.enrolled, 0);
    const totalYearly = cohorts.reduce((sum, c) => sum + c.converted_yearly, 0);
    const totalMonthly = cohorts.reduce((sum, c) => sum + c.converted_monthly, 0);
    const totalCoaching = cohorts.reduce((sum, c) => sum + c.coaching_upsells, 0);
    const totalClubhouse = totalYearly + totalMonthly;

    const totalRevenue =
      cohorts.reduce((sum, c) => sum + c.revenue_cohort + c.revenue_yearly + c.revenue_monthly + c.revenue_coaching, 0);

    const activeCohort = cohorts.find((c) => c.status === "active");
    const upcomingCohort = cohorts.find((c) => c.status === "upcoming");
    const completedCohorts = cohorts.filter((c) => c.status === "completed");

    return {
      totalLeads,
      totalWebClassAttendees,
      totalEnrolled,
      totalYearly,
      totalMonthly,
      totalCoaching,
      totalClubhouse,
      totalRevenue,
      activeCohort,
      upcomingCohort,
      completedCohorts,
      cohortCount: cohorts.length,
    };
  }, [cohorts, webClasses, leads]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCreateCohort = async () => {
    if (!newCohort.name || !newCohort.start_date || !newCohort.end_date) return;
    await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cohort", ...newCohort }),
    });
    setShowAddCohort(false);
    setNewCohort({ name: "", start_date: "", end_date: "" });
    fetchData();
  };

  const handleCreateWebClass = async () => {
    if (!newWebClass.class_date) return;
    await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "web_class", ...newWebClass }),
    });
    setShowAddWebClass(false);
    setNewWebClass({ class_date: "", notes: "" });
    fetchData();
  };

  const handleStartEdit = (cohort: MarketingCohort) => {
    setEditingCohortId(cohort.id);
    setEditForm({ ...cohort });
  };

  const handleSaveEdit = async () => {
    if (!editForm || !editingCohortId) return;
    await fetch(`/api/marketing/${editingCohortId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "cohort", ...editForm }),
    });
    setEditingCohortId(null);
    setEditForm(null);
    fetchData();
  };

  const handleCancelEdit = () => {
    setEditingCohortId(null);
    setEditForm(null);
  };

  const handleStartWcEdit = (wc: MarketingWebClass) => {
    setEditingWebClassId(wc.id);
    setWcEditForm({ ...wc });
  };

  const handleSaveWcEdit = async () => {
    if (!wcEditForm || !editingWebClassId) return;
    await fetch(`/api/marketing/${editingWebClassId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "web_class", ...wcEditForm }),
    });
    setEditingWebClassId(null);
    setWcEditForm(null);
    fetchData();
  };

  const handleCancelWcEdit = () => {
    setEditingWebClassId(null);
    setWcEditForm(null);
  };

  const handleStartLeadEdit = (lead: MarketingLead) => {
    setEditingLeadId(lead.id);
    setLeadEditForm({ ...lead });
  };

  const handleSaveLeadEdit = async () => {
    if (!leadEditForm || !editingLeadId) return;
    await fetch(`/api/marketing/${editingLeadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table: "lead", ...leadEditForm }),
    });
    setEditingLeadId(null);
    setLeadEditForm(null);
    fetchData();
  };

  const handleCancelLeadEdit = () => {
    setEditingLeadId(null);
    setLeadEditForm(null);
  };

  const handleCreateLead = async () => {
    if (!newLead.period || newLead.count <= 0) return;
    await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "lead", ...newLead }),
    });
    setShowAddLead(false);
    setNewLead({ source: "organic", count: 0, period: format(new Date(), "yyyy-MM"), notes: "" });
    fetchData();
  };

  const handleDeleteLead = async (id: string) => {
    await fetch(`/api/marketing/${id}?table=lead`, { method: "DELETE" });
    fetchData();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const today = new Date();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              The Machine
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Jake Berman&apos;s marketing funnel &mdash; all roads lead to the Clubhouse
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mb-6 flex items-center gap-1 rounded-lg border border-border/50 bg-card/20 p-1">
          {([
            { id: "dashboard" as const, label: "Dashboard", icon: LayoutGrid },
            { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
            { id: "projections" as const, label: "Projections", icon: TrendingUp },
          ]).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ================================================================== */}
        {/* CALENDAR TAB */}
        {/* ================================================================== */}
        {activeTab === "calendar" && (
          <MarketingCalendar
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            cohorts={cohorts}
            webClasses={webClasses}
          />
        )}

        {/* ================================================================== */}
        {/* PROJECTIONS TAB */}
        {/* ================================================================== */}
        {activeTab === "projections" && (
          <ProjectionsTab cohorts={cohorts} webClasses={webClasses} />
        )}

        {/* ================================================================== */}
        {/* DASHBOARD TAB */}
        {/* ================================================================== */}
        {activeTab === "dashboard" && (<>

        {/* ------------------------------------------------------------------ */}
        {/* PIPELINE VISUALIZATION */}
        {/* ------------------------------------------------------------------ */}
        <div className="mb-8">
          <div className="flex items-stretch gap-0">
            {FUNNEL_STAGES.map((stage, i) => {
              // Compute the aggregate number for each stage
              let count = 0;
              let sublabel = "";
              if (stage.id === "leads") {
                count = stats.totalLeads;
                sublabel = "total leads";
              } else if (stage.id === "web_class") {
                count = stats.totalWebClassAttendees;
                sublabel = "attendees";
              } else if (stage.id === "cohort") {
                count = stats.totalEnrolled;
                sublabel = "enrolled";
              } else if (stage.id === "clubhouse") {
                count = stats.totalClubhouse;
                sublabel = "members";
              } else if (stage.id === "coaching") {
                count = stats.totalCoaching;
                sublabel = "sessions";
              }

              return (
                <div key={stage.id} className="flex items-stretch">
                  <div
                    className="flex min-w-[140px] flex-1 flex-col items-center justify-center rounded-lg border border-border/50 px-4 py-4 transition-colors hover:border-border"
                    style={{ backgroundColor: `${stage.color}10` }}
                  >
                    <div
                      className="mb-1 font-mono text-2xl font-bold"
                      style={{ color: stage.color }}
                    >
                      {count}
                    </div>
                    <div className="text-center text-xs font-medium text-foreground/80">
                      {stage.label}
                    </div>
                    <div className="mt-0.5 text-center text-[10px] text-muted-foreground">
                      {sublabel}
                    </div>
                  </div>
                  {i < FUNNEL_STAGES.length - 1 && (
                    <div className="flex items-center px-1">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Conversion rates between stages */}
          <div className="mt-2 flex items-center gap-0">
            {[
              { from: stats.totalLeads, to: stats.totalWebClassAttendees },
              { from: stats.totalWebClassAttendees, to: stats.totalEnrolled },
              { from: stats.totalEnrolled, to: stats.totalClubhouse },
              { from: stats.totalClubhouse, to: stats.totalCoaching },
            ].map((conv, i) => (
              <div key={i} className="flex items-center">
                <div className="min-w-[140px] flex-1 text-center text-[10px] text-muted-foreground">
                  {/* spacer for alignment */}
                </div>
                <div className="px-1 text-center">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {fmtPercent(conv.to, conv.from)}
                  </span>
                </div>
              </div>
            ))}
            <div className="min-w-[140px] flex-1" />
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* STATS CARDS */}
        {/* ------------------------------------------------------------------ */}
        <div className="mb-8 grid grid-cols-4 gap-3">
          <StatCard
            label="Total Revenue"
            value={fmtMoney(stats.totalRevenue)}
            icon={DollarSign}
            color="#a6e3a1"
            sub={`from ${stats.completedCohorts.length} completed cohort${stats.completedCohorts.length !== 1 ? "s" : ""}`}
          />
          <StatCard
            label="Clubhouse Members"
            value={String(stats.totalClubhouse)}
            icon={Users}
            color="#cba6f7"
            sub={`${stats.totalYearly} yearly, ${stats.totalMonthly} monthly`}
          />
          <StatCard
            label="Avg Conversion"
            value={fmtPercent(stats.totalClubhouse, stats.totalEnrolled)}
            icon={TrendingUp}
            color="#f9e2af"
            sub="cohort → clubhouse"
          />
          <StatCard
            label="Next Web Class"
            value={(() => {
              const next = webClasses.find((w) => isAfter(parseISO(w.class_date), today));
              return next ? format(parseISO(next.class_date), "MMM d") : "—";
            })()}
            icon={Video}
            color="#89b4fa"
            sub="live every 2 weeks"
          />
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* COHORT TIMELINE */}
        {/* ------------------------------------------------------------------ */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground/80">
              Cohort Timeline
            </h2>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowAddCohort(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add Cohort
            </Button>
          </div>

          {/* Add Cohort Form */}
          {showAddCohort && (
            <div className="mb-3 rounded-lg border border-border/50 bg-card/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-foreground/80">New Cohort</span>
                <button onClick={() => setShowAddCohort(false)}>
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Cohort name"
                  value={newCohort.name}
                  onChange={(e) => setNewCohort({ ...newCohort, name: e.target.value })}
                  className="h-8 text-xs"
                />
                <Input
                  type="date"
                  value={newCohort.start_date}
                  onChange={(e) => setNewCohort({ ...newCohort, start_date: e.target.value })}
                  className="h-8 w-40 text-xs"
                />
                <Input
                  type="date"
                  value={newCohort.end_date}
                  onChange={(e) => setNewCohort({ ...newCohort, end_date: e.target.value })}
                  className="h-8 w-40 text-xs"
                />
                <Button size="sm" className="h-8 text-xs" onClick={handleCreateCohort}>
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Cohort Cards */}
          <div className="space-y-3">
            {cohorts.map((cohort) => {
              const isEditing = editingCohortId === cohort.id;
              const ef = editForm;
              const start = parseISO(cohort.start_date);
              const end = parseISO(cohort.end_date);
              const totalDays = differenceInDays(end, start);
              const elapsed = Math.max(0, Math.min(totalDays, differenceInDays(today, start)));
              const progressPct = totalDays > 0 ? Math.round((elapsed / totalDays) * 100) : 0;
              const weekNum = Math.min(4, Math.ceil(elapsed / 7));
              const totalCohortRev = cohort.revenue_cohort + cohort.revenue_yearly + cohort.revenue_monthly + cohort.revenue_coaching;
              const statusCfg = COHORT_STATUS_CONFIG[cohort.status as CohortStatus];

              return (
                <div
                  key={cohort.id}
                  className="rounded-lg border border-border/50 bg-card/40 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" style={{ color: statusCfg?.color ?? "#6c7086" }} />
                      <span className="text-sm font-semibold">{cohort.name}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: `${statusCfg?.color ?? "#6c7086"}20`,
                          color: statusCfg?.color ?? "#6c7086",
                        }}
                      >
                        {statusCfg?.label ?? cohort.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing && ef ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="date"
                            value={ef.start_date ?? cohort.start_date}
                            onChange={(e) => setEditForm({ ...ef, start_date: e.target.value })}
                            className="h-7 w-36 text-xs"
                          />
                          <span className="text-xs text-muted-foreground">—</span>
                          <Input
                            type="date"
                            value={ef.end_date ?? cohort.end_date}
                            onChange={(e) => setEditForm({ ...ef, end_date: e.target.value })}
                            className="h-7 w-36 text-xs"
                          />
                          <select
                            value={ef.status ?? cohort.status}
                            onChange={(e) => setEditForm({ ...ef, status: e.target.value as CohortStatus })}
                            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                          >
                            <option value="upcoming">Upcoming</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {format(start, "MMM d")} — {format(end, "MMM d, yyyy")}
                        </span>
                      )}
                      {!isEditing ? (
                        <button
                          onClick={() => handleStartEdit(cohort)}
                          className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={handleSaveEdit}
                            className="rounded p-1 text-emerald-400 transition-colors hover:text-emerald-300"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar (for active/completed) */}
                  {cohort.status !== "upcoming" && (
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">
                          {cohort.status === "completed"
                            ? "Completed"
                            : `Week ${weekNum} of 4`}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {cohort.status === "completed" ? "100%" : `${progressPct}%`}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-border/50">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${cohort.status === "completed" ? 100 : progressPct}%`,
                            backgroundColor: statusCfg?.color ?? "#6c7086",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Metrics Grid */}
                  {isEditing && ef ? (
                    <div className="grid grid-cols-7 gap-2">
                      <EditMetric label="Enrolled" field="enrolled" value={ef.enrolled ?? 0} onChange={(v) => setEditForm({ ...ef, enrolled: v })} />
                      <EditMetric label="Yearly" field="converted_yearly" value={ef.converted_yearly ?? 0} onChange={(v) => setEditForm({ ...ef, converted_yearly: v })} />
                      <EditMetric label="Monthly" field="converted_monthly" value={ef.converted_monthly ?? 0} onChange={(v) => setEditForm({ ...ef, converted_monthly: v })} />
                      <EditMetric label="Coaching" field="coaching_upsells" value={ef.coaching_upsells ?? 0} onChange={(v) => setEditForm({ ...ef, coaching_upsells: v })} />
                      <EditMoneyMetric label="Cohort Fees" value={ef.revenue_cohort ?? 0} onChange={(v) => setEditForm({ ...ef, revenue_cohort: v })} />
                      <EditMoneyMetric label="Rev (Yearly)" value={ef.revenue_yearly ?? 0} onChange={(v) => setEditForm({ ...ef, revenue_yearly: v })} />
                      <EditMoneyMetric label="Rev (Monthly)" value={ef.revenue_monthly ?? 0} onChange={(v) => setEditForm({ ...ef, revenue_monthly: v })} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-7 gap-2">
                      <MetricCell label="Enrolled" value={cohort.enrolled} color="#89b4fa" />
                      <MetricCell label="Cohort Fees" value={fmtMoney(cohort.revenue_cohort)} color="#89b4fa" isMoney={false} />
                      <MetricCell label="→ Yearly" value={cohort.converted_yearly} color="#cba6f7" />
                      <MetricCell label="→ Monthly" value={cohort.converted_monthly} color="#cba6f7" />
                      <MetricCell label="→ Coaching" value={cohort.coaching_upsells} color="#fab387" />
                      <MetricCell label="Conversion" value={fmtPercent(cohort.converted_yearly + cohort.converted_monthly, cohort.enrolled)} color="#a6e3a1" isMoney={false} />
                      <MetricCell label="Total Rev" value={fmtMoney(totalCohortRev)} color="#a6e3a1" isMoney={false} />
                    </div>
                  )}

                  {/* Notes */}
                  {cohort.notes && !isEditing && (
                    <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      {cohort.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* WEB CLASS SCHEDULE + LEAD SOURCES (side by side) */}
        {/* ------------------------------------------------------------------ */}
        <div className="grid grid-cols-2 gap-6">
          {/* Web Class Schedule */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/80">
                Web Class Schedule
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setShowAddWebClass(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Class
              </Button>
            </div>

            {showAddWebClass && (
              <div className="mb-3 rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground/80">New Web Class</span>
                  <button onClick={() => setShowAddWebClass(false)}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newWebClass.class_date}
                    onChange={(e) => setNewWebClass({ ...newWebClass, class_date: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Notes"
                    value={newWebClass.notes}
                    onChange={(e) => setNewWebClass({ ...newWebClass, notes: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleCreateWebClass}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {webClasses.map((wc) => {
                const isWcEditing = editingWebClassId === wc.id;
                const wef = wcEditForm;
                const wcDate = parseISO(wc.class_date);
                const isPast = isBefore(wcDate, today);
                const isUpcoming = isAfter(wcDate, today);
                const isSoon = isUpcoming && differenceInDays(wcDate, today) <= 14;

                return (
                  <div
                    key={wc.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5",
                      isPast ? "bg-card/20" : "bg-card/40",
                      isSoon && "border-[#a6e3a1]/30"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                        isPast ? "bg-muted-foreground/10" : "bg-[#a6e3a1]/10"
                      )}
                    >
                      <Video
                        className="h-4 w-4"
                        style={{ color: isPast ? "#6c7086" : "#a6e3a1" }}
                      />
                    </div>

                    {isWcEditing && wef ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="date"
                          value={wef.class_date ?? wc.class_date}
                          onChange={(e) => setWcEditForm({ ...wef, class_date: e.target.value })}
                          className="h-7 w-36 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder="Attendees"
                          value={wef.attendees ?? 0}
                          onChange={(e) => setWcEditForm({ ...wef, attendees: parseInt(e.target.value) || 0 })}
                          className="h-7 w-20 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder="Signups"
                          value={wef.signups_to_cohort ?? 0}
                          onChange={(e) => setWcEditForm({ ...wef, signups_to_cohort: parseInt(e.target.value) || 0 })}
                          className="h-7 w-20 text-xs"
                        />
                        <button
                          onClick={handleSaveWcEdit}
                          className="rounded p-1 text-emerald-400 transition-colors hover:text-emerald-300"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={handleCancelWcEdit}
                          className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-xs font-medium",
                              isPast ? "text-muted-foreground" : "text-foreground/80"
                            )}>
                              {format(wcDate, "EEEE, MMM d, yyyy")}
                            </span>
                            {isSoon && (
                              <span className="rounded-full bg-[#a6e3a1]/15 px-1.5 py-0.5 text-[9px] font-medium text-[#a6e3a1]">
                                Upcoming
                              </span>
                            )}
                          </div>
                          {(wc.attendees > 0 || wc.signups_to_cohort > 0) && (
                            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                              <span>{wc.attendees} attendees</span>
                              <span>{wc.signups_to_cohort} signups</span>
                              <span className="font-mono">
                                {fmtPercent(wc.signups_to_cohort, wc.attendees)} conv
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleStartWcEdit(wc)}
                          className="shrink-0 rounded p-1 text-muted-foreground/30 transition-colors hover:text-muted-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lead Sources */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground/80">
                Lead Sources
              </h2>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setShowAddLead(true)}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Lead
              </Button>
            </div>

            {/* Add Lead Form */}
            {showAddLead && (
              <div className="mb-3 rounded-lg border border-border/50 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground/80">New Lead Source</span>
                  <button onClick={() => setShowAddLead(false)}>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={newLead.source}
                    onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                    className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                  >
                    {Object.entries(LEAD_SOURCE_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    placeholder="Count"
                    value={newLead.count || ""}
                    onChange={(e) => setNewLead({ ...newLead, count: parseInt(e.target.value) || 0 })}
                    className="h-8 w-20 text-xs"
                  />
                  <Input
                    type="month"
                    value={newLead.period}
                    onChange={(e) => setNewLead({ ...newLead, period: e.target.value })}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 text-xs" onClick={handleCreateLead}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Group leads by period */}
            {(() => {
              const periods = [...new Set(leads.map((l) => l.period))].sort().reverse();
              return periods.map((period) => {
                const periodLeads = leads.filter((l) => l.period === period);
                const periodTotal = periodLeads.reduce((s, l) => s + l.count, 0);

                return (
                  <div key={period} className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground/60">
                        {format(parseISO(`${period}-01`), "MMMM yyyy")}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {periodTotal} total
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {periodLeads.map((lead) => {
                        const cfg = LEAD_SOURCE_CONFIG[lead.source as LeadSource];
                        const pct = periodTotal > 0 ? (lead.count / periodTotal) * 100 : 0;
                        const isLeadEditing = editingLeadId === lead.id;
                        const lef = leadEditForm;

                        return (
                          <div
                            key={lead.id}
                            className="group rounded-lg border border-border/50 bg-card/40 px-3 py-2"
                          >
                            {isLeadEditing && lef ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={lef.source ?? lead.source}
                                  onChange={(e) => setLeadEditForm({ ...lef, source: e.target.value as LeadSource })}
                                  className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                                >
                                  {Object.entries(LEAD_SOURCE_CONFIG).map(([key, c]) => (
                                    <option key={key} value={key}>{c.label}</option>
                                  ))}
                                </select>
                                <Input
                                  type="number"
                                  value={lef.count ?? lead.count}
                                  onChange={(e) => setLeadEditForm({ ...lef, count: parseInt(e.target.value) || 0 })}
                                  className="h-7 w-20 text-xs"
                                />
                                <button
                                  onClick={handleSaveLeadEdit}
                                  className="rounded p-1 text-emerald-400 transition-colors hover:text-emerald-300"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={handleCancelLeadEdit}
                                  className="rounded p-1 text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="mb-1 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: cfg?.color ?? "#6c7086" }}
                                    />
                                    <span className="text-xs font-medium text-foreground/80">
                                      {cfg?.label ?? lead.source}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-xs" style={{ color: cfg?.color ?? "#6c7086" }}>
                                      {lead.count}
                                    </span>
                                    <button
                                      onClick={() => handleStartLeadEdit(lead)}
                                      className="rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-muted-foreground"
                                    >
                                      <Pencil className="h-2.5 w-2.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteLead(lead.id)}
                                      className="rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/40 hover:!text-destructive"
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </button>
                                  </div>
                                </div>
                                <div className="h-1 w-full rounded-full bg-border/30">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: cfg?.color ?? "#6c7086",
                                    }}
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* REVENUE BREAKDOWN (from all cohorts) */}
        {/* ------------------------------------------------------------------ */}
        {stats.completedCohorts.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-foreground/80">
              Revenue Breakdown
            </h2>
            <div className="grid grid-cols-4 gap-3">
              <RevenueCard
                label="Cohort Fees"
                value={cohorts.reduce((s, c) => s + c.revenue_cohort, 0)}
                color="#89b4fa"
                sub={`${stats.totalEnrolled} enrolled x $97`}
              />
              <RevenueCard
                label="Clubhouse (Yearly)"
                value={cohorts.reduce((s, c) => s + c.revenue_yearly, 0)}
                color="#cba6f7"
                sub={`${stats.totalYearly} members x $297`}
              />
              <RevenueCard
                label="Clubhouse (Monthly)"
                value={cohorts.reduce((s, c) => s + c.revenue_monthly, 0)}
                color="#cba6f7"
                sub={`${stats.totalMonthly} members x $47/mo`}
              />
              <RevenueCard
                label="1:1 Coaching"
                value={cohorts.reduce((s, c) => s + c.revenue_coaching, 0)}
                color="#fab387"
                sub={`${stats.totalCoaching} session${stats.totalCoaching !== 1 ? "s" : ""} x $297`}
              />
            </div>
          </div>
        )}

        </>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projections Tab
// ---------------------------------------------------------------------------

interface ProjectionInputs {
  webClassesPerMonth: number;
  attendeesPerClass: number;
  classToCohorConv: number;    // % of attendees who join cohort
  cohortToYearlyConv: number;  // % of cohort who go yearly
  cohortToMonthlyConv: number; // % of cohort who go monthly
  cohortToCoachingConv: number;// % of cohort who buy coaching
  yearlyPrice: number;
  monthlyPrice: number;
  coachingPrice: number;
  cohortPrice: number;
  monthlyChurnRate: number;    // % of monthly members who cancel each month
}

interface ProjectionMonth {
  label: string;
  webClassAttendees: number;
  newCohortEnrolled: number;
  newYearly: number;
  newMonthly: number;
  newCoaching: number;
  cumulativeYearly: number;
  cumulativeMonthly: number;
  revenueCohort: number;
  revenueYearly: number;
  revenueMonthly: number;
  revenueCoaching: number;
  revenueTotal: number;
  cumulativeRevenue: number;
}

function computeProjections(inputs: ProjectionInputs, months: number): ProjectionMonth[] {
  const results: ProjectionMonth[] = [];
  let cumYearly = 0;
  let cumMonthly = 0;
  let cumRevenue = 0;

  const now = new Date();

  for (let m = 0; m < months; m++) {
    const monthDate = addMonths(now, m);
    const label = format(monthDate, "MMM yyyy");

    const webClassAttendees = inputs.webClassesPerMonth * inputs.attendeesPerClass;
    const newCohortEnrolled = Math.round(webClassAttendees * (inputs.classToCohorConv / 100));
    const newYearly = Math.round(newCohortEnrolled * (inputs.cohortToYearlyConv / 100));
    const newMonthly = Math.round(newCohortEnrolled * (inputs.cohortToMonthlyConv / 100));
    const newCoaching = Math.round(newCohortEnrolled * (inputs.cohortToCoachingConv / 100));

    // Apply churn to existing monthly members before adding new
    const churnedMonthly = Math.floor(cumMonthly * (inputs.monthlyChurnRate / 100));
    cumMonthly = cumMonthly - churnedMonthly + newMonthly;
    cumYearly += newYearly;

    const revenueCohort = newCohortEnrolled * inputs.cohortPrice;
    const revenueYearly = newYearly * inputs.yearlyPrice;
    const revenueMonthly = cumMonthly * inputs.monthlyPrice; // recurring from all active monthly
    const revenueCoaching = newCoaching * inputs.coachingPrice;
    const revenueTotal = revenueCohort + revenueYearly + revenueMonthly + revenueCoaching;
    cumRevenue += revenueTotal;

    results.push({
      label,
      webClassAttendees,
      newCohortEnrolled,
      newYearly,
      newMonthly,
      newCoaching,
      cumulativeYearly: cumYearly,
      cumulativeMonthly: cumMonthly,
      revenueCohort,
      revenueYearly,
      revenueMonthly,
      revenueCoaching,
      revenueTotal,
      cumulativeRevenue: cumRevenue,
    });
  }

  return results;
}

function ProjectionsTab({
  cohorts,
  webClasses,
}: {
  cohorts: MarketingCohort[];
  webClasses: MarketingWebClass[];
}) {
  // Derive defaults from actual data
  const defaults = useMemo(() => {
    const completedCohorts = cohorts.filter((c) => c.status === "completed");
    const pastClasses = webClasses.filter((w) => w.attendees > 0);

    const avgAttendees = pastClasses.length > 0
      ? Math.round(pastClasses.reduce((s, w) => s + w.attendees, 0) / pastClasses.length)
      : 30;

    const totalEnrolled = completedCohorts.reduce((s, c) => s + c.enrolled, 0);
    const totalAttendees = pastClasses.reduce((s, w) => s + w.attendees, 0);
    const totalYearly = completedCohorts.reduce((s, c) => s + c.converted_yearly, 0);
    const totalMonthly = completedCohorts.reduce((s, c) => s + c.converted_monthly, 0);
    const totalCoaching = completedCohorts.reduce((s, c) => s + c.coaching_upsells, 0);

    return {
      webClassesPerMonth: 2,
      attendeesPerClass: avgAttendees,
      classToCohorConv: totalAttendees > 0 ? Math.round((totalEnrolled / totalAttendees) * 100) : 43,
      cohortToYearlyConv: totalEnrolled > 0 ? Math.round((totalYearly / totalEnrolled) * 100) : 39,
      cohortToMonthlyConv: totalEnrolled > 0 ? Math.round((totalMonthly / totalEnrolled) * 100) : 11,
      cohortToCoachingConv: totalEnrolled > 0 ? Math.round((totalCoaching / totalEnrolled) * 100) : 6,
      yearlyPrice: 297,
      monthlyPrice: 47,
      coachingPrice: 297,
      cohortPrice: 97,
      monthlyChurnRate: 10,
    } satisfies ProjectionInputs;
  }, [cohorts, webClasses]);

  const [inputs, setInputs] = useState<ProjectionInputs>(defaults);
  const [projectionMonths, setProjectionMonths] = useState(10);

  // Reset inputs when defaults change (new data loaded)
  useEffect(() => {
    setInputs(defaults);
  }, [defaults]);

  const projections = useMemo(
    () => computeProjections(inputs, projectionMonths),
    [inputs, projectionMonths]
  );

  const totals = useMemo(() => {
    const last = projections[projections.length - 1];
    return {
      totalRevenue: last?.cumulativeRevenue ?? 0,
      totalYearly: last?.cumulativeYearly ?? 0,
      totalMonthly: last?.cumulativeMonthly ?? 0,
      totalMembers: (last?.cumulativeYearly ?? 0) + (last?.cumulativeMonthly ?? 0),
      avgMonthlyRevenue: projections.length > 0
        ? Math.round(projections.reduce((s, p) => s + p.revenueTotal, 0) / projections.length)
        : 0,
    };
  }, [projections]);

  const updateInput = (field: keyof ProjectionInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const chartTooltipStyle = {
    contentStyle: { background: "#252538", border: "1px solid #3b3b54", borderRadius: 8 },
    labelStyle: { color: "#cdd6f4", fontSize: 12, marginBottom: 4 },
    itemStyle: { fontSize: 11, padding: 0 },
  };

  return (
    <div>
      {/* Projection summary cards */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatCard
          label={`${projectionMonths}-Month Revenue`}
          value={fmtMoney(totals.totalRevenue)}
          icon={DollarSign}
          color="#a6e3a1"
          sub={`avg ${fmtMoney(totals.avgMonthlyRevenue)}/mo`}
        />
        <StatCard
          label="Projected Members"
          value={String(totals.totalMembers)}
          icon={Users}
          color="#cba6f7"
          sub={`${totals.totalYearly} yearly, ${totals.totalMonthly} monthly`}
        />
        <StatCard
          label="Monthly Recurring"
          value={fmtMoney((totals.totalMonthly * inputs.monthlyPrice))}
          icon={TrendingUp}
          color="#f9e2af"
          sub={`${totals.totalMonthly} members x $${inputs.monthlyPrice}/mo`}
        />
        <StatCard
          label="Est. Year-End Revenue"
          value={fmtMoney(projections.length >= 10 ? projections[9]?.cumulativeRevenue ?? 0 : totals.totalRevenue)}
          icon={Trophy}
          color="#fab387"
          sub="cumulative by end of projection"
        />
      </div>

      <div className="mb-6 grid grid-cols-[320px_1fr] gap-6">
        {/* Inputs panel */}
        <div className="space-y-4 rounded-lg border border-border/50 bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground/80">Assumptions</h3>
            <button
              onClick={() => setInputs(defaults)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Reset to Actuals
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Pre-filled from your actual conversion data. Adjust to model different scenarios.
          </p>

          <ProjectionInput
            label="Web classes / month"
            value={inputs.webClassesPerMonth}
            onChange={(v) => updateInput("webClassesPerMonth", v)}
            min={1} max={8}
          />
          <ProjectionInput
            label="Attendees / class"
            value={inputs.attendeesPerClass}
            onChange={(v) => updateInput("attendeesPerClass", v)}
            min={5} max={500}
          />
          <ProjectionInput
            label="Class → Cohort conv %"
            value={inputs.classToCohorConv}
            onChange={(v) => updateInput("classToCohorConv", v)}
            suffix="%"
            min={1} max={100}
          />
          <ProjectionInput
            label="Cohort → Yearly conv %"
            value={inputs.cohortToYearlyConv}
            onChange={(v) => updateInput("cohortToYearlyConv", v)}
            suffix="%"
            min={0} max={100}
          />
          <ProjectionInput
            label="Cohort → Monthly conv %"
            value={inputs.cohortToMonthlyConv}
            onChange={(v) => updateInput("cohortToMonthlyConv", v)}
            suffix="%"
            min={0} max={100}
          />
          <ProjectionInput
            label="Cohort → Coaching conv %"
            value={inputs.cohortToCoachingConv}
            onChange={(v) => updateInput("cohortToCoachingConv", v)}
            suffix="%"
            min={0} max={100}
          />

          <div className="border-t border-border/30 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Pricing
            </p>
            <ProjectionInput
              label="Cohort fee"
              value={inputs.cohortPrice}
              onChange={(v) => updateInput("cohortPrice", v)}
              prefix="$"
              min={0} max={1000}
            />
            <ProjectionInput
              label="Yearly membership"
              value={inputs.yearlyPrice}
              onChange={(v) => updateInput("yearlyPrice", v)}
              prefix="$"
              min={0} max={2000}
            />
            <ProjectionInput
              label="Monthly membership"
              value={inputs.monthlyPrice}
              onChange={(v) => updateInput("monthlyPrice", v)}
              prefix="$"
              min={0} max={500}
            />
            <ProjectionInput
              label="Coaching session"
              value={inputs.coachingPrice}
              onChange={(v) => updateInput("coachingPrice", v)}
              prefix="$"
              min={0} max={2000}
            />
          </div>

          <div className="border-t border-border/30 pt-3">
            <ProjectionInput
              label="Monthly churn rate"
              value={inputs.monthlyChurnRate}
              onChange={(v) => updateInput("monthlyChurnRate", v)}
              suffix="%"
              min={0} max={50}
            />
            <div className="mt-3">
              <label className="mb-1 block text-[10px] text-muted-foreground">
                Projection length
              </label>
              <div className="flex items-center gap-2">
                {[6, 10, 12, 18, 24].map((m) => (
                  <button
                    key={m}
                    onClick={() => setProjectionMonths(m)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors",
                      projectionMonths === m
                        ? "bg-primary/20 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m}mo
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="space-y-6">
          {/* Revenue chart */}
          <div className="rounded-lg border border-border/50 bg-card/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-foreground/80">
              Projected Monthly Revenue
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={projections} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#3b3b54" />
                <XAxis dataKey="label" stroke="#6c7086" fontSize={10} tickLine={false} />
                <YAxis stroke="#6c7086" fontSize={10} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} tickLine={false} />
                <RechartsTooltip
                  {...chartTooltipStyle}
                  formatter={((value: number, name: string) => [fmtMoney(value), name]) as any}
                />
                <Legend
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                />
                <Bar dataKey="revenueYearly" name="Yearly" fill="#cba6f7" stackId="rev" radius={[0, 0, 0, 0]} />
                <Bar dataKey="revenueMonthly" name="Monthly (recurring)" fill="#89b4fa" stackId="rev" />
                <Bar dataKey="revenueCoaching" name="Coaching" fill="#fab387" stackId="rev" />
                <Bar dataKey="revenueCohort" name="Cohort Fees" fill="#a6e3a1" stackId="rev" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Cumulative revenue + members */}
          <div className="rounded-lg border border-border/50 bg-card/40 p-4">
            <h3 className="mb-3 text-xs font-semibold text-foreground/80">
              Cumulative Revenue & Members
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={projections}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3b3b54" />
                <XAxis dataKey="label" stroke="#6c7086" fontSize={10} tickLine={false} />
                <YAxis
                  yAxisId="revenue"
                  stroke="#6c7086"
                  fontSize={10}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="members"
                  orientation="right"
                  stroke="#6c7086"
                  fontSize={10}
                  tickLine={false}
                />
                <RechartsTooltip
                  {...chartTooltipStyle}
                  formatter={((value: number, name: string) =>
                    name.includes("Revenue") ? [fmtMoney(value), name] : [value, name]
                  ) as any}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="cumulativeRevenue"
                  name="Cumulative Revenue"
                  stroke="#a6e3a1"
                  fill="#a6e3a1"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  yAxisId="members"
                  type="monotone"
                  dataKey="cumulativeYearly"
                  name="Yearly Members"
                  stroke="#cba6f7"
                  fill="#cba6f7"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  yAxisId="members"
                  type="monotone"
                  dataKey="cumulativeMonthly"
                  name="Monthly Members"
                  stroke="#89b4fa"
                  fill="#89b4fa"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Month-by-month table */}
      <div className="rounded-lg border border-border/50 bg-card/40">
        <div className="border-b border-border/30 px-4 py-3">
          <h3 className="text-xs font-semibold text-foreground/80">
            Month-by-Month Breakdown
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border/30 text-left text-muted-foreground">
                <th className="whitespace-nowrap px-3 py-2 font-medium">Month</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Attendees</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Enrolled</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">New Yearly</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">New Monthly</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Coaching</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Total Members</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Monthly Rev</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium text-right">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-border/10 transition-colors hover:bg-card/60",
                    i === 0 && "bg-primary/5"
                  )}
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground/80">{p.label}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#89b4fa]">{p.webClassAttendees}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#f9e2af]">{p.newCohortEnrolled}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#cba6f7]">{p.newYearly}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#cba6f7]">{p.newMonthly}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#fab387]">{p.newCoaching}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-foreground/80">{p.cumulativeYearly + p.cumulativeMonthly}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-[#a6e3a1]">{fmtMoney(p.revenueTotal)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-semibold text-[#a6e3a1]">{fmtMoney(p.cumulativeRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ProjectionInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max = 9999,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="shrink-0 text-[11px] text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-[10px] text-muted-foreground">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v >= min && v <= max) onChange(v);
          }}
          className="h-7 w-16 rounded-md border border-border bg-background px-2 text-right font-mono text-xs text-foreground outline-none focus:border-primary/50"
          min={min}
          max={max}
        />
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marketing Calendar
// ---------------------------------------------------------------------------

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A cohort bar segment for one week row. */
interface CohortBar {
  cohort: MarketingCohort;
  colStart: number;
  colSpan: number;
  startsThisWeek: boolean;
  endsThisWeek: boolean;
}

function MarketingCalendar({
  calMonth,
  setCalMonth,
  cohorts,
  webClasses,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  cohorts: MarketingCohort[];
  webClasses: MarketingWebClass[];
}) {
  // Build 6-week grid
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = addDays(gridStart, 41);
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < gridDays.length; i += 7) {
    weeks.push(gridDays.slice(i, i + 7));
  }

  // Index web classes by date string for quick lookup
  const wcByDate = useMemo(() => {
    const map: Record<string, MarketingWebClass> = {};
    for (const wc of webClasses) {
      map[wc.class_date] = wc;
    }
    return map;
  }, [webClasses]);

  // For each week, compute cohort bar segments
  function getCohortBars(week: Date[]): CohortBar[] {
    const weekStart = week[0];
    const weekEnd = week[6];
    const bars: CohortBar[] = [];

    for (const cohort of cohorts) {
      const cStart = parseISO(cohort.start_date);
      const cEnd = parseISO(cohort.end_date);

      // Does this cohort overlap with this week?
      if (isAfter(cStart, weekEnd) || isBefore(cEnd, weekStart)) continue;

      const clampedStart = isBefore(cStart, weekStart) ? weekStart : cStart;
      const clampedEnd = isAfter(cEnd, weekEnd) ? weekEnd : cEnd;

      const colStart = clampedStart.getDay();
      const colEnd = clampedEnd.getDay();
      const colSpan = colEnd - colStart + 1;

      bars.push({
        cohort,
        colStart,
        colSpan,
        startsThisWeek: !isBefore(cStart, weekStart),
        endsThisWeek: !isAfter(cEnd, weekEnd),
      });
    }

    return bars;
  }

  const statusColor = (status: string) => {
    return COHORT_STATUS_CONFIG[status as CohortStatus]?.color ?? "#6c7086";
  };

  return (
    <div>
      {/* Calendar header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">
            {format(calMonth, "MMMM yyyy")}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCalMonth(subMonths(calMonth, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCalMonth(addMonths(calMonth, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setCalMonth(new Date())}
          >
            Today
          </Button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-[#a6e3a1]" />
            Web Class
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-6 rounded-sm bg-[#f9e2af]/60" />
            Cohort (active)
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-6 rounded-sm bg-[#89b4fa]/60" />
            Cohort (upcoming)
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-6 rounded-sm bg-[#6c7086]/40" />
            Cohort (completed)
          </div>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-border/30">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wIdx) => {
        const bars = getCohortBars(week);
        const barAreaHeight = bars.length > 0 ? bars.length * 24 : 0;

        return (
          <div
            key={wIdx}
            className="relative border-b border-border/20"
            style={{ minHeight: Math.max(100, 32 + barAreaHeight + 36) }}
          >
            {/* Day cells */}
            <div className="grid h-full grid-cols-7">
              {week.map((day, colIdx) => {
                const inMonth = isSameMonth(day, calMonth);
                const todayDay = isToday(day);
                const dateStr = format(day, "yyyy-MM-dd");
                const wc = wcByDate[dateStr];

                return (
                  <div
                    key={colIdx}
                    className={cn(
                      "flex flex-col border-r border-border/20 last:border-r-0",
                      !inMonth && "opacity-30"
                    )}
                  >
                    {/* Day number */}
                    <div className="flex justify-end px-2 pt-1" style={{ height: 28 }}>
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          todayDay
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                    </div>

                    {/* Spacer for cohort bars */}
                    <div style={{ height: barAreaHeight }} />

                    {/* Web class pill */}
                    {wc && (
                      <div className="px-1 pb-1">
                        <div className="flex items-center gap-1 rounded bg-[#a6e3a1]/15 px-1.5 py-1">
                          <Video className="h-3 w-3 text-[#a6e3a1]" />
                          <span className="truncate text-[10px] font-medium text-[#a6e3a1]">
                            Web Class
                          </span>
                        </div>
                        {wc.attendees > 0 && (
                          <div className="mt-0.5 px-0.5 text-[9px] text-muted-foreground">
                            {wc.attendees} att / {wc.signups_to_cohort} sign
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cohort bars — absolutely positioned */}
            {bars.map((bar, bIdx) => {
              const color = statusColor(bar.cohort.status);
              const cellPct = 100 / 7;
              const leftPct = bar.colStart * cellPct;
              const widthPct = bar.colSpan * cellPct;
              const topPx = 28 + bIdx * 24;

              return (
                <div
                  key={`${bar.cohort.id}-w${wIdx}`}
                  className={cn(
                    "absolute z-10 flex items-center overflow-hidden",
                    bar.startsThisWeek ? "rounded-l-[4px]" : "rounded-l-none",
                    bar.endsThisWeek ? "rounded-r-[4px]" : "rounded-r-none"
                  )}
                  style={{
                    left: `calc(${leftPct}% + 3px)`,
                    width: `calc(${widthPct}% - 6px)`,
                    top: topPx,
                    height: 20,
                    backgroundColor: `${color}40`,
                    borderLeft: bar.startsThisWeek ? `3px solid ${color}` : undefined,
                  }}
                  title={`${bar.cohort.name} (${bar.cohort.status})`}
                >
                  {bar.startsThisWeek && (
                    <span
                      className="truncate px-2 text-[10px] font-medium"
                      style={{ color }}
                    >
                      {bar.cohort.name}
                      {bar.cohort.enrolled > 0 && ` — ${bar.cohort.enrolled} enrolled`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
  sub: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  color,
  isMoney = true,
}: {
  label: string;
  value: number | string;
  color: string;
  isMoney?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/30 bg-background/50 px-2 py-1.5 text-center">
      <div className="font-mono text-sm font-semibold" style={{ color }}>
        {typeof value === "number" ? value : value}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EditMetric({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="text-center">
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="h-7 text-center font-mono text-xs"
      />
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EditMoneyMetric({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="text-center">
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-7 text-center font-mono text-xs"
      />
      <div className="mt-0.5 text-[9px] text-muted-foreground">{label}</div>
    </div>
  );
}

function RevenueCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/40 p-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-lg font-bold" style={{ color }}>
        {fmtMoney(value)}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
