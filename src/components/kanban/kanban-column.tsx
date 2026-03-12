"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  Inbox,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./kanban-card";
import type { Column, Card } from "@/lib/types";

const ICON_MAP = {
  Inbox,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
};

interface KanbanColumnProps {
  column: Column;
  cards: Card[];
  isSelecting?: boolean;
  bulkSelectedCardIds?: string[];
  onToggleBulkSelect?: (cardId: string) => void;
  onSelectAllInColumn?: (columnId: string) => void;
}

export function KanbanColumn({
  column,
  cards,
  isSelecting,
  bulkSelectedCardIds = [],
  onToggleBulkSelect,
  onSelectAllInColumn,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  // Done column starts collapsed
  const [collapsed, setCollapsed] = useState(column.id === "done");

  const Icon = ICON_MAP[column.icon as keyof typeof ICON_MAP];
  const isDone = column.id === "done";

  // Count how many cards in this column are selected
  const selectedInColumn = isSelecting
    ? cards.filter((c) => bulkSelectedCardIds.includes(c.id)).length
    : 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full shrink-0 flex-col rounded-lg border border-border/50 bg-card/30 transition-all",
        collapsed ? "w-[52px]" : "w-[280px]",
        isOver && "border-primary/30 bg-primary/5"
      )}
    >
      {/* Column Header */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-full flex-col items-center gap-2 px-2 py-3"
        >
          <Icon className={cn("h-4 w-4 shrink-0", column.color)} />
          <span className="font-mono text-xs text-muted-foreground">
            {cards.length}
          </span>
          <span
            className="text-[10px] font-medium text-foreground/60"
            style={{ writingMode: "vertical-rl" }}
          >
            {column.title}
          </span>
          <ChevronRight className="mt-auto h-3.5 w-3.5 text-muted-foreground/40" />
        </button>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Icon className={cn("h-4 w-4", column.color)} />
            <span className="text-sm font-medium text-foreground/80">
              {column.title}
            </span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {cards.length}
            </span>

            {/* Select all in column button */}
            {isSelecting && cards.length > 0 && (
              <button
                onClick={() => onSelectAllInColumn?.(column.id)}
                title={`Select all in ${column.title}`}
                className={cn(
                  "rounded p-0.5 transition-colors",
                  selectedInColumn === cards.length
                    ? "text-primary"
                    : "text-muted-foreground/40 hover:text-muted-foreground"
                )}
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
            )}

            {isDone && (
              <button
                onClick={() => setCollapsed(true)}
                className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Cards */}
          <div className="flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
            {cards.map((card) => (
              <KanbanCard
                key={card.id}
                card={card}
                isSelecting={isSelecting}
                isSelected={bulkSelectedCardIds.includes(card.id)}
                onToggleSelect={() => onToggleBulkSelect?.(card.id)}
              />
            ))}
            {cards.length === 0 && (
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-border/30">
                <span className="text-xs text-muted-foreground/50">
                  Drop here
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
