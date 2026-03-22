"use client";

import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Database,
  ShoppingCart,
  Users,
  GitBranch,
  BarChart3,
  Clock,
  AlertTriangle,
  Plug,
} from "lucide-react";

type TaskStatus = "done" | "in_progress" | "not_started";

interface PhaseTask {
  label: string;
  status: TaskStatus;
}

interface Phase {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  status: "complete" | "active" | "upcoming";
  outcome: string;
  tasks: PhaseTask[];
  dependencies?: string;
}

const phases: Phase[] = [
  {
    id: 0,
    title: "Foundation",
    subtitle: "Cloud infrastructure & auth",
    icon: <Database className="h-5 w-5" />,
    status: "complete",
    outcome:
      "Executive team can log in and see existing dashboard views with current data, hosted in the cloud.",
    tasks: [
      { label: "Design Supabase schema", status: "done" },
      { label: "Set up Supabase project with RLS policies", status: "done" },
      { label: "Implement Supabase Auth (invite-only)", status: "done" },
      {
        label: "Role-based access control (admin, executive, manager, sales rep, program manager, custom viewer)",
        status: "done",
      },
      { label: "Sales Rep role — scoped to own meetings + sales, write access for outcome tagging", status: "done" },
      { label: "Program-scoped roles — program managers see only their program data", status: "done" },
      { label: "Additive permission model — easy to add new roles without rework", status: "done" },
      { label: "Per-user access overrides — admin can expand or restrict any user's base role", status: "done" },
      { label: "Deploy to Vercel", status: "done" },
      { label: "Migrate existing data to Supabase", status: "done" },
      { label: "Environment variable setup — Supabase creds on Vercel", status: "done" },
      { label: "Admin sync health panel — view sync log, surface errors, manual re-trigger per workflow", status: "done" },
    ],
  },
  {
    id: 1,
    title: "Purchase & Sales Sync",
    subtitle: "Replace manual sales entry",
    icon: <ShoppingCart className="h-5 w-5" />,
    status: "active",
    outcome:
      "Sales tab shows real revenue data without manual entry, every sale is attributable to a rep, and lead quality is tracked from meeting to close.",
    dependencies: "Phase 0",
    tasks: [
      { label: "DECISION: Charge title parsing approach — Option D (hybrid) selected", status: "done" },
      { label: "HubSpot API key setup + environment variables on Vercel", status: "done" },
      { label: "Product catalogue seeded (25 products, 27 title mappings)", status: "done" },
      { label: "Charges view — company-wide transaction ledger with charts + filters", status: "done" },
      { label: "Contact sync from HubSpot (64K+ contacts backfilled)", status: "done" },
      { label: "Historical charge backfill (238K charges, 64K contacts from HubSpot)", status: "done" },
      { label: "HubSpot charge sync — daily n8n workflow created, pending activation", status: "in_progress" },
      { label: "SamCart direct sync — affiliates, payment plans, refunds, subscription status (dedup via SamCart transaction ID)", status: "not_started" },
      { label: "SamCart subscription event sync — dunning failures, payment retries, pauses (early churn signals)", status: "not_started" },
      { label: "Kajabi sync — evaluate API, direct sync if richer than HubSpot charges", status: "not_started" },
      { label: "Sales attribution — auto from SamCart affiliates", status: "not_started" },
      { label: "Sales attribution — manual UI for non-affiliate purchases", status: "not_started" },
      { label: "Meeting sync — 12.6K meetings backfilled + daily n8n workflow created", status: "done" },
      { label: "Meeting outcome tagging (No Show, Rescheduled, Not Qualified, Lead, Sold)", status: "done" },
      { label: "Lead quality metrics — no-show rate, qualification rate, close rate per rep + funnel", status: "not_started" },
      { label: "Sales rep login with scoped access", status: "not_started" },
      { label: "Sync status indicator + last synced timestamp", status: "not_started" },
    ],
  },
  {
    id: 2,
    title: "Student & Enrollment Sync",
    subtitle: "Automate student tracking with student vs. partner classification",
    icon: <Users className="h-5 w-5" />,
    status: "upcoming",
    outcome:
      "Student roster stays current without manual enrollment tracking, with accurate student vs. partner counts and automated classification.",
    dependencies: "Phase 1",
    tasks: [
      { label: "Accelerator auto-classification: charge → student, partner form → partner (linked via form questions), neither → flag", status: "not_started" },
      { label: "Elite auto-classification: charge → student, no charge → flag (no partner concept for Elite)", status: "not_started" },
      { label: "Partner auto-linking — connect partner to their student via HubSpot form question data", status: "not_started" },
      { label: "Enrollment Data Quality Panel — inline HubSpot data + one-click classify actions (Student / Partner / Link / Ignore) for both programs", status: "not_started" },
      { label: "Accurate counts — actual students vs. total members (students + partners)", status: "not_started" },
      { label: "Partner list viewable per student", status: "not_started" },
      { label: "Subscription status sync (active, cancelled, paused)", status: "not_started" },
      { label: "Churn event auto-logging", status: "not_started" },
      { label: "Daily reconciliation — Accelerator + Elite: compare HubSpot segments vs. Supabase, flag mismatches + unclassified", status: "not_started" },
      { label: "Manual fields: coach assignment, notes, attendance", status: "not_started" },
      { label: "Future: Accelerator Hub auto-provisioning when Hub is ready", status: "not_started" },
    ],
  },
  {
    id: 3,
    title: "Funnel & Journey Tracking",
    subtitle: "Full customer journey visibility with auto-discovery",
    icon: <GitBranch className="h-5 w-5" />,
    status: "upcoming",
    outcome:
      'The executive team can answer "Which funnels actually drive revenue, how fast, and how often do those customers come back?"',
    dependencies: "Phases 1 + 2",
    tasks: [
      { label: "HubSpot segment naming convention (LM: / QZ: / WC: / FN:)", status: "not_started" },
      { label: "Historical segment import — one-time classification of existing segments", status: "not_started" },
      { label: "Funnel auto-discovery workflow (daily n8n scan)", status: "not_started" },
      { label: "Journey events schema + data model", status: "not_started" },
      { label: "Form submission listener (HubSpot webhook)", status: "not_started" },
      { label: "Historical journey backfill", status: "not_started" },
      { label: "Funnel performance dashboard", status: "not_started" },
      { label: "Contact journey timeline view", status: "not_started" },
      { label: "Speed to purchase + cohort analysis", status: "not_started" },
      { label: "First vs. repeat buyer breakdown", status: "not_started" },
      { label: "Attribution Sankey diagram — funnel → product flow", status: "not_started" },
      { label: "Daily metrics aggregation", status: "not_started" },
    ],
  },
  {
    id: 4,
    title: "Advanced Analytics & Reporting",
    subtitle: "AI-powered insights, alerts, and daily digest",
    icon: <BarChart3 className="h-5 w-5" />,
    status: "upcoming",
    outcome:
      "Leadership gets a daily Slack briefing, intelligent alerts, and proactive insights — the dashboard tells you what to pay attention to before you ask.",
    dependencies: "Phase 3",
    tasks: [
      { label: "PREREQUISITE: Define Claude scheduled task hosting, triggering, failure alerting, and retry plan before building", status: "not_started" },
      { label: "Daily executive Slack digest (Claude scheduled task — trend-aware, not template-based)", status: "not_started" },
      { label: "Weekly executive report email (Claude task — narrative with week-over-week analysis)", status: "not_started" },
      { label: "Churn risk scoring (Claude task — contextual reasoning, not just a number)", status: "not_started" },
      { label: "Intelligent alerts (Claude task — judges severity, provides context + suggested actions)", status: "not_started" },
      { label: "LTV prediction from purchase history + engagement patterns", status: "not_started" },
      { label: "Revenue forecasting (MRR trends, seasonality)", status: "not_started" },
      { label: "CSV/PDF export for any view", status: "not_started" },
    ],
  },
  {
    id: 5,
    title: "External Integrations & AI-Assisted Sales",
    subtitle: "Zoom transcripts, call intelligence, social analytics",
    icon: <Plug className="h-5 w-5" />,
    status: "upcoming",
    outcome:
      "Sales calls are automatically evaluated and follow-up copy generated. Content performance ties directly to revenue attribution.",
    dependencies: "Phase 4",
    tasks: [
      { label: "Zoom transcript auto-capture (n8n webhook → store in Supabase)", status: "not_started" },
      { label: "Sales call AI evaluation (Claude task — score against sales GPS rubric)", status: "not_started" },
      { label: "AI-generated follow-up email drafts (Claude task)", status: "not_started" },
      { label: "YouTube analytics integration", status: "not_started" },
      { label: "Instagram / Meta analytics integration", status: "not_started" },
      { label: "Meta Ads / Google Ads spend + ROAS tracking", status: "not_started" },
      { label: "Content & Ads dashboard view", status: "not_started" },
    ],
  },
];

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />;
  }
  if (status === "in_progress") {
    return <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400 animate-pulse" />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />;
}

function PhaseStatusBadge({ status }: { status: Phase["status"] }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
        <CheckCircle2 className="h-3 w-3" /> Complete
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
        <Clock className="h-3 w-3" /> In Progress
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground/70">
      Upcoming
    </span>
  );
}

export function RoadmapView() {
  const totalTasks = phases.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "done").length,
    0
  );
  const inProgressTasks = phases.reduce(
    (sum, p) => sum + p.tasks.filter((t) => t.status === "in_progress").length,
    0
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Mission Control v2 Roadmap
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            From local SQLite to automated cloud-hosted executive platform
          </p>

          {/* Progress summary */}
          <div className="mt-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{completedTasks}</span> done
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{inProgressTasks}</span> in progress
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Circle className="h-4 w-4 text-muted-foreground/70" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {totalTasks - completedTasks - inProgressTasks}
                </span>{" "}
                remaining
              </span>
            </div>
          </div>

          {/* Overall progress bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Phase cards */}
        <div className="space-y-4">
          {phases.map((phase, i) => {
            const phaseDone = phase.tasks.filter((t) => t.status === "done").length;
            const phaseTotal = phase.tasks.length;
            const phaseProgress = phaseTotal > 0 ? (phaseDone / phaseTotal) * 100 : 0;

            return (
              <div key={phase.id}>
                {/* Connector arrow */}
                {i > 0 && (
                  <div className="flex justify-center py-1">
                    <ArrowRight className="h-4 w-4 rotate-90 text-muted-foreground/30" />
                  </div>
                )}

                <div
                  className={cn(
                    "rounded-xl border p-5 transition-colors",
                    phase.status === "active"
                      ? "border-amber-500/30 bg-amber-500/[0.03]"
                      : phase.status === "complete"
                        ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                        : "border-border/40 bg-card/30"
                  )}
                >
                  {/* Phase header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-0.5 rounded-lg p-2",
                          phase.status === "active"
                            ? "bg-amber-500/10 text-amber-400"
                            : phase.status === "complete"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-muted/20 text-muted-foreground/60"
                        )}
                      >
                        {phase.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            Phase {phase.id}
                          </span>
                          <PhaseStatusBadge status={phase.status} />
                        </div>
                        <h2 className="mt-0.5 text-base font-semibold">{phase.title}</h2>
                        <p className="text-xs text-muted-foreground">{phase.subtitle}</p>
                      </div>
                    </div>

                    {/* Phase progress */}
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">
                        {phaseDone}/{phaseTotal}
                      </span>
                      <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${phaseProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dependencies */}
                  {phase.dependencies && (
                    <div className="ml-12 mt-1">
                      <span className="text-[10px] text-muted-foreground/60">
                        Depends on: {phase.dependencies}
                      </span>
                    </div>
                  )}

                  {/* Task list */}
                  <div className="ml-12 mt-4 space-y-1.5">
                    {phase.tasks.map((task, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <StatusIcon status={task.status} />
                        <span
                          className={cn(
                            "text-xs leading-tight",
                            task.status === "done"
                              ? "text-muted-foreground/70 line-through"
                              : task.status === "in_progress"
                                ? "text-foreground"
                                : "text-muted-foreground"
                          )}
                        >
                          {task.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Outcome */}
                  <div className="ml-12 mt-4 rounded-md bg-muted/15 px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Outcome
                    </span>
                    <p className="mt-0.5 text-xs text-foreground/70">
                      {phase.outcome}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Deprecated features note */}
        <div className="mt-8 rounded-xl border border-border/30 bg-card/20 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs font-semibold text-muted-foreground">
              Not Migrating to v2
            </span>
          </div>
          <div className="mt-3 space-y-1.5 ml-6">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Marketing — Jake Berman funnel machine (personal tool, may rebuild with GHL integration later)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Projects tracker (may be recreated later)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
