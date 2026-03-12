"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { PRIORITY_CONFIG, type Card } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Calendar, Check, GripVertical } from "lucide-react";
import { format, isPast, isToday } from "date-fns";

interface KanbanCardProps {
  card: Card;
  isDragOverlay?: boolean;
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function KanbanCard({
  card,
  isDragOverlay,
  isSelecting,
  isSelected,
  onToggleSelect,
}: KanbanCardProps) {
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const projects = useStore((s) => s.projects);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityConfig = PRIORITY_CONFIG[card.priority];
  const project = card.project_id
    ? projects.find((p) => p.id === card.project_id)
    : null;

  const hasDueDate = !!card.due_date;
  const dueDate = hasDueDate ? new Date(card.due_date!) : null;
  const isOverdue = dueDate ? isPast(dueDate) && !isToday(dueDate) && card.column_id !== "done" : false;

  const handleClick = () => {
    if (isDragging) return;
    if (isSelecting && onToggleSelect) {
      onToggleSelect();
      return;
    }
    setSelectedCardId(card.id);
  };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        "group cursor-pointer rounded-md border-l-2 bg-card p-3 shadow-sm transition-all hover:bg-card/80",
        priorityConfig.borderColor,
        isDragging && "opacity-30",
        isDragOverlay && "rotate-2 shadow-lg shadow-black/20",
        isSelecting && isSelected && "ring-1 ring-primary/60 bg-primary/5"
      )}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2">
        {/* Selection checkbox */}
        {isSelecting && (
          <button
            type="button"
            className="mt-0.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
          >
            <div
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border transition-colors",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 bg-transparent hover:border-muted-foreground/70"
              )}
            >
              {isSelected && <Check className="h-2.5 w-2.5" />}
            </div>
          </button>
        )}

        {/* Drag Handle */}
        {!isSelecting && (
          <button
            className="mt-0.5 shrink-0 cursor-grab opacity-0 transition-opacity group-hover:opacity-50 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          {/* Title */}
          <p className="text-sm font-medium leading-snug text-foreground/90">
            {card.title}
          </p>

          {/* Meta Row */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {/* Priority */}
            <span
              className={cn(
                "font-mono text-[10px] font-semibold uppercase",
                priorityConfig.color
              )}
            >
              {card.priority}
            </span>

            {/* Project Badge */}
            {project && (
              <Badge
                variant="outline"
                className="h-4 border-none px-1.5 text-[10px]"
                style={{
                  backgroundColor: project.color + "20",
                  color: project.color,
                }}
              >
                {project.name}
              </Badge>
            )}

            {/* Due Date */}
            {hasDueDate && dueDate && (
              <span
                className={cn(
                  "flex items-center gap-0.5 text-[10px]",
                  isOverdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                <Calendar className="h-2.5 w-2.5" />
                {format(dueDate, "MMM d")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
