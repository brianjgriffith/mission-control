"use client";

import { useStore } from "@/lib/store";
import { PRIORITY_CONFIG, COLUMNS } from "@/lib/types";
import type { CalendarEvent } from "@/lib/types";
import { cn, formatTimePST } from "@/lib/utils";
import {
  Inbox,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Calendar,
  Zap,
  TrendingUp,
  Plus,
  FolderOpen,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  isThisWeek,
  isPast,
  isToday,
  parseISO,
  differenceInDays,
  addDays,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useMemo } from "react";

const COLUMN_ICONS = {
  inbox: Inbox,
  todo: Circle,
  in_progress: Timer,
  blocked: AlertCircle,
  done: CheckCircle2,
};

export function DashboardView() {
  const cards = useStore((s) => s.cards);
  const activity = useStore((s) => s.activity);
  const projects = useStore((s) => s.projects);
  const setActiveView = useStore((s) => s.setActiveView);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const toggleQuickAdd = useStore((s) => s.toggleQuickAdd);
  const navigateToProject = useStore((s) => s.navigateToProject);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Fetch calendar events for the next 7 days
  useEffect(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const nextWeek = format(addDays(new Date(), 7), "yyyy-MM-dd");
    fetch(`/api/calendar?start=${today}&end=${nextWeek}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.events) setCalendarEvents(data.events);
      })
      .catch(() => {});
  }, []);

  const activeCards = cards.filter((c) => !c.archived);

  // Build a project lookup
  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  // Today's Focus: Top priority in-progress items
  const focusCards = activeCards
    .filter((c) => c.column_id === "in_progress")
    .sort((a, b) => {
      const priorityOrder = { p1: 0, p2: 1, p3: 2, p4: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
    .slice(0, 3);

  // Quick stats
  const stats = COLUMNS.map((col) => ({
    ...col,
    count: activeCards.filter((c) => c.column_id === col.id).length,
  }));

  // Project summary
  const activeProjects = projects.filter((p) => p.status === "active");
  const projectStats = activeProjects.map((p) => ({
    ...p,
    cardCount: activeCards.filter((c) => c.project_id === p.id).length,
    inProgressCount: activeCards.filter(
      (c) => c.project_id === p.id && c.column_id === "in_progress"
    ).length,
  }));

  // Upcoming: cards with due dates this week
  const upcoming = activeCards
    .filter(
      (c) =>
        c.due_date &&
        c.column_id !== "done" &&
        (isThisWeek(parseISO(c.due_date)) || isPast(parseISO(c.due_date)))
    )
    .sort((a, b) => {
      const dateA = new Date(a.due_date!).getTime();
      const dateB = new Date(b.due_date!).getTime();
      return dateA - dateB;
    })
    .slice(0, 5);

  // Recent activity
  const recentActivity = activity.slice(0, 8);

  // ---- Stale Card Detection ------------------------------------------------
  const now = new Date();

  const staleCards = useMemo(() => {
    const stale: { card: (typeof activeCards)[0]; reason: string }[] = [];

    for (const card of activeCards) {
      const updated = parseISO(card.updated_at);
      const daysSinceUpdate = differenceInDays(now, updated);

      // In progress for >7 days without update
      if (card.column_id === "in_progress" && daysSinceUpdate > 7) {
        stale.push({
          card,
          reason: `In progress ${daysSinceUpdate}d without update`,
        });
      }
      // Blocked for >3 days
      else if (card.column_id === "blocked" && daysSinceUpdate > 3) {
        stale.push({
          card,
          reason: `Blocked for ${daysSinceUpdate}d`,
        });
      }
      // Todo with past due date
      else if (
        card.column_id === "todo" &&
        card.due_date &&
        isPast(parseISO(card.due_date)) &&
        !isToday(parseISO(card.due_date))
      ) {
        stale.push({
          card,
          reason: `Overdue since ${format(parseISO(card.due_date), "MMM d")}`,
        });
      }
    }

    // Sort by priority then staleness
    return stale.sort((a, b) => {
      const pOrder = { p1: 0, p2: 1, p3: 2, p4: 3 };
      return pOrder[a.card.priority] - pOrder[b.card.priority];
    });
  }, [activeCards]);

  // Upcoming calendar events (next 7 days)
  const upcomingEvents = useMemo(() => {
    return calendarEvents.slice(0, 5);
  }, [calendarEvents]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Mission Control
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
          </div>
          <Button size="sm" onClick={toggleQuickAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Quick Add
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="mb-6 grid grid-cols-5 gap-2">
          {stats.map((stat) => {
            const Icon = COLUMN_ICONS[stat.id];
            return (
              <button
                key={stat.id}
                onClick={() => setActiveView("kanban")}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 transition-colors hover:bg-card/60"
              >
                <Icon className={cn("h-4 w-4", stat.color)} />
                <div className="text-left">
                  <p className="font-mono text-lg font-semibold leading-none">
                    {stat.count}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {stat.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Needs Attention (Stale Cards) */}
        {staleCards.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold">Needs Attention</h2>
              <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                {staleCards.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {staleCards.slice(0, 5).map(({ card, reason }) => {
                const pri = PRIORITY_CONFIG[card.priority];
                const proj = card.project_id
                  ? projectMap[card.project_id]
                  : null;
                return (
                  <button
                    key={card.id}
                    onClick={() => setSelectedCardId(card.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border-l-2 bg-card/40 px-3 py-2 text-left transition-colors hover:bg-card/60",
                      pri.borderColor
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {card.title}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-[10px] text-amber-400/80">
                          {reason}
                        </span>
                        {proj && (
                          <span
                            className="text-[10px]"
                            style={{ color: proj.color }}
                          >
                            {proj.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              })}
              {staleCards.length > 5 && (
                <p className="px-3 text-[10px] text-muted-foreground/60">
                  +{staleCards.length - 5} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Projects Row */}
        {projectStats.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-primary/60" />
              <h2 className="text-sm font-semibold">Projects</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {projectStats.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigateToProject(p.id)}
                  className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-card/60"
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.cardCount} task{p.cardCount !== 1 ? "s" : ""}
                      {p.inProgressCount > 0 && (
                        <span className="text-amber-400">
                          {" "}({p.inProgressCount} active)
                        </span>
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Today's Focus */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold">Today&apos;s Focus</h2>
            </div>
            <div className="space-y-2">
              {focusCards.length > 0 ? (
                focusCards.map((card) => {
                  const pri = PRIORITY_CONFIG[card.priority];
                  const proj = card.project_id ? projectMap[card.project_id] : null;
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border-l-2 bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-card/60",
                        pri.borderColor
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {card.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "font-mono text-[10px] uppercase",
                              pri.color
                            )}
                          >
                            {card.priority}
                          </span>
                          {proj && (
                            <span
                              className="text-[10px]"
                              style={{ color: proj.color }}
                            >
                              {proj.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
                  <Timer className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    No items in progress
                  </p>
                  <button
                    onClick={() => setActiveView("kanban")}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    Go to Kanban board
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Upcoming This Week */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              <h2 className="text-sm font-semibold">Upcoming</h2>
            </div>
            <div className="space-y-2">
              {upcoming.length > 0 ? (
                upcoming.map((card) => {
                  const dueDate = parseISO(card.due_date!);
                  const overdue = isPast(dueDate) && !isToday(dueDate);
                  return (
                    <button
                      key={card.id}
                      onClick={() => setSelectedCardId(card.id)}
                      className="flex w-full items-center gap-3 rounded-lg bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-card/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {card.title}
                        </p>
                        <span
                          className={cn(
                            "text-[10px]",
                            overdue
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {overdue ? "Overdue: " : ""}
                          {format(dueDate, "EEE, MMM d")}
                        </span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
                  <Calendar className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">
                    No upcoming deadlines
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* This Week's Schedule */}
        {upcomingEvents.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-400" />
              <h2 className="text-sm font-semibold">This Week&apos;s Schedule</h2>
            </div>
            <div className="space-y-1.5">
              {upcomingEvents.map((evt) => {
                const startDate = parseISO(evt.start_date);
                const isMultiDay = evt.end_date && evt.end_date !== evt.start_date;
                return (
                  <button
                    key={evt.id}
                    onClick={() => setActiveView("calendar")}
                    className="flex w-full items-center gap-3 rounded-lg bg-card/40 px-3 py-2 text-left transition-colors hover:bg-card/60"
                  >
                    <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: evt.color || "#6366f1" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {evt.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground">
                        {isToday(startDate)
                          ? "Today"
                          : format(startDate, "EEE, MMM d")}
                        {isMultiDay && ` - ${format(parseISO(evt.end_date!), "EEE, MMM d")}`}
                      </span>
                    </div>
                    <span className="shrink-0 rounded bg-muted/30 px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                      {evt.event_type}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold">Recent Activity</h2>
          </div>
          {recentActivity.length > 0 ? (
            <div className="space-y-1">
              {recentActivity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-md px-3 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground/50">
                    {formatTimePST(entry.created_at)}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.action}
                  </span>
                  {entry.card_title && (
                    <span className="truncate font-medium text-foreground/70">
                      {entry.card_title}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground/50">
              No activity yet. Create your first task to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
