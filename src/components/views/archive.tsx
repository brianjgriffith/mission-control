"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { PRIORITY_CONFIG, COLUMNS, type Card } from "@/lib/types";
import { cn, formatDateTimePST } from "@/lib/utils";
import {
  Archive,
  Search,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ArchiveView() {
  const projects = useStore((s) => s.projects);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const fetchCards = useStore((s) => s.fetchCards);

  const [archivedCards, setArchivedCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchArchived = useCallback(async () => {
    try {
      const res = await fetch("/api/cards?archived=1");
      if (!res.ok) return;
      const json = await res.json();
      setArchivedCards(
        (json.cards ?? []).map((c: Record<string, unknown>) => ({
          ...c,
          archived: Boolean(c.archived),
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchived();
  }, [fetchArchived]);

  const handleUnarchive = async (cardId: string) => {
    await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: 0, column_id: "inbox" }),
    });
    await Promise.all([fetchArchived(), fetchCards()]);
  };

  // Build project lookup
  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  // Filter
  const filtered = archivedCards.filter((card) => {
    if (filterProjectId && card.project_id !== filterProjectId) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        card.title.toLowerCase().includes(q) ||
        card.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by project
  const grouped = new Map<string, Card[]>();
  for (const card of filtered) {
    const key = card.project_id || "__none__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(card);
  }

  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Archive</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {archivedCards.length} completed task
              {archivedCards.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archived tasks..."
              className="h-8 w-full rounded-md border border-input bg-secondary pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All Projects</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border/50">
            <Archive className="mb-2 h-6 w-6 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground/50">
              {search || filterProjectId
                ? "No matching archived tasks"
                : "No archived tasks yet"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/30">
              Done tasks are auto-archived after 7 days
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([projectId, cards]) => {
              const proj = projectId !== "__none__" ? projectMap[projectId] : null;
              return (
                <div key={projectId}>
                  <div className="mb-2 flex items-center gap-2">
                    {proj ? (
                      <>
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: proj.color }}
                        />
                        <span className="text-xs font-medium">{proj.name}</span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        No Project
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {cards.length}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {cards.map((card) => {
                      const pri = PRIORITY_CONFIG[card.priority];
                      const col = COLUMNS.find(
                        (c) => c.id === card.column_id
                      );
                      return (
                        <div
                          key={card.id}
                          className="flex items-center gap-3 rounded-md bg-card/30 px-3 py-2 transition-colors hover:bg-card/50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/50" />
                          <button
                            onClick={() => setSelectedCardId(card.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-sm text-foreground/70">
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
                              {col && (
                                <span className="text-[10px] text-muted-foreground/50">
                                  {col.title}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground/30">
                                {formatDateTimePST(card.updated_at)}
                              </span>
                            </div>
                          </button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleUnarchive(card.id)}
                            className="h-7 shrink-0 text-[10px] text-muted-foreground hover:text-foreground"
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Restore
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
