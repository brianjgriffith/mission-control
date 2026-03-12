"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { PRIORITY_CONFIG, type Card } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Map as MapIcon,
  AlertTriangle,
  Calendar,
  ChevronRight,
} from "lucide-react";
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  format,
  parseISO,
  isWithinInterval,
  isBefore,
  startOfDay,
} from "date-fns";

export function RoadmapView() {
  const cards = useStore((s) => s.cards);
  const projects = useStore((s) => s.projects);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const setActiveView = useStore((s) => s.setActiveView);

  const today = startOfDay(new Date());

  // Build 6 weeks: current + 5 ahead
  const weeks = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      return {
        start: weekStart,
        end: weekEnd,
        label:
          i === 0
            ? "This Week"
            : i === 1
              ? "Next Week"
              : format(weekStart, "MMM d"),
        sublabel: `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d")}`,
      };
    });
  }, [today]);

  // Project lookup
  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  // Active (non-archived, non-done) cards
  const activeCards = cards.filter(
    (c) => !c.archived && c.column_id !== "done"
  );

  // Overdue: has due_date in the past, not done
  const overdue = activeCards.filter(
    (c) => c.due_date && isBefore(parseISO(c.due_date), today)
  );

  // Cards bucketed by week
  const weekCards = weeks.map((week) =>
    activeCards.filter(
      (c) =>
        c.due_date &&
        isWithinInterval(parseISO(c.due_date), {
          start: week.start,
          end: week.end,
        })
    )
  );

  // Unscheduled: active, not done, no due_date
  const unscheduled = activeCards.filter((c) => !c.due_date);

  // Group unscheduled by project
  const unscheduledByProject = new Map<string, Card[]>();
  for (const c of unscheduled) {
    const key = c.project_id || "__none__";
    if (!unscheduledByProject.has(key)) unscheduledByProject.set(key, []);
    unscheduledByProject.get(key)!.push(c);
  }

  const renderCard = (card: Card, compact = false) => {
    const pri = PRIORITY_CONFIG[card.priority];
    const proj = card.project_id ? projectMap[card.project_id] : null;
    return (
      <button
        key={card.id}
        onClick={() => setSelectedCardId(card.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border-l-2 bg-card/40 text-left transition-colors hover:bg-card/60",
          pri.borderColor,
          compact ? "px-2 py-1.5" : "px-2.5 py-2"
        )}
      >
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-medium", compact ? "text-[11px]" : "text-xs")}>
            {card.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("font-mono text-[9px] uppercase", pri.color)}>
              {card.priority}
            </span>
            {proj && (
              <span className="text-[9px]" style={{ color: proj.color }}>
                {proj.name}
              </span>
            )}
            {card.due_date && (
              <span className="text-[9px] text-muted-foreground/50">
                {format(parseISO(card.due_date), "MMM d")}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
      </button>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          {/* Header */}
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Roadmap</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {format(today, "MMMM yyyy")} - 6 week view
              </p>
            </div>
          </div>

          {/* Overdue Section */}
          {overdue.length > 0 && (
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-xs font-semibold text-destructive">
                  Overdue
                </span>
                <span className="font-mono text-[10px] text-destructive/60">
                  {overdue.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                {overdue.map((card) => renderCard(card, true))}
              </div>
            </div>
          )}

          {/* Weekly Timeline */}
          <div className="space-y-4">
            {weeks.map((week, i) => (
              <div key={i}>
                <div className="mb-2 flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground/50" />
                  <span
                    className={cn(
                      "text-xs font-semibold",
                      i === 0 ? "text-primary" : "text-foreground/70"
                    )}
                  >
                    {week.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {week.sublabel}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground/40">
                    {weekCards[i].length}
                  </span>
                </div>
                {weekCards[i].length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5 pl-7">
                    {weekCards[i]
                      .sort((a, b) => {
                        const po = { p1: 0, p2: 1, p3: 2, p4: 3 };
                        return po[a.priority] - po[b.priority];
                      })
                      .map((card) => renderCard(card))}
                  </div>
                ) : (
                  <div className="ml-7 rounded-md border border-dashed border-border/30 py-3 text-center">
                    <span className="text-[10px] text-muted-foreground/30">
                      No tasks scheduled
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Unscheduled Sidebar */}
      <div className="w-[260px] shrink-0 overflow-y-auto border-l border-border bg-card/20 px-3 py-6">
        <div className="mb-4 flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-muted-foreground/50" />
          <span className="text-xs font-semibold">Unscheduled</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {unscheduled.length}
          </span>
        </div>
        <p className="mb-4 text-[10px] text-muted-foreground/40">
          Set a due date on these tasks to place them on the timeline.
        </p>

        {unscheduled.length > 0 ? (
          <div className="space-y-4">
            {Array.from(unscheduledByProject.entries()).map(
              ([projectId, projectCards]) => {
                const proj =
                  projectId !== "__none__" ? projectMap[projectId] : null;
                return (
                  <div key={projectId}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      {proj ? (
                        <>
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: proj.color }}
                          />
                          <span className="text-[10px] font-medium">
                            {proj.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          No Project
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {projectCards.map((card) => renderCard(card, true))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/30 py-6 text-center">
            <span className="text-[10px] text-muted-foreground/30">
              All tasks are scheduled
            </span>
            <button
              onClick={() => setActiveView("kanban")}
              className="mt-2 block w-full text-[10px] text-primary hover:underline"
            >
              Go to Kanban
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
