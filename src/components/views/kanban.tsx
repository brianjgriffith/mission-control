"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useStore } from "@/lib/store";
import { COLUMNS, type ColumnId, type Card } from "@/lib/types";
import { KanbanColumn } from "@/components/kanban/kanban-column";
import { KanbanCard } from "@/components/kanban/kanban-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Archive,
  ChevronDown,
  SquareMousePointer,
  Plus,
  X,
  Repeat,
} from "lucide-react";
import { CardTemplates } from "@/components/card-templates";

export function KanbanView() {
  const cards = useStore((s) => s.cards);
  const moveCard = useStore((s) => s.moveCard);
  const toggleQuickAdd = useStore((s) => s.toggleQuickAdd);
  const filterPriority = useStore((s) => s.filterPriority);
  const setFilterPriority = useStore((s) => s.setFilterPriority);
  const filterProjectId = useStore((s) => s.filterProjectId);
  const setFilterProjectId = useStore((s) => s.setFilterProjectId);
  const projects = useStore((s) => s.projects);

  // Bulk selection
  const bulkSelectedCardIds = useStore((s) => s.bulkSelectedCardIds);
  const toggleBulkSelect = useStore((s) => s.toggleBulkSelect);
  const clearBulkSelection = useStore((s) => s.clearBulkSelection);
  const selectAllInColumn = useStore((s) => s.selectAllInColumn);
  const bulkMoveCards = useStore((s) => s.bulkMoveCards);
  const bulkArchiveCards = useStore((s) => s.bulkArchiveCards);

  const [isSelecting, setIsSelecting] = useState(false);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const getFilteredCardsByColumn = useCallback(
    (columnId: ColumnId) => {
      return cards
        .filter((c) => {
          if (c.column_id !== columnId) return false;
          if (c.archived) return false;
          if (filterProjectId && c.project_id !== filterProjectId) return false;
          if (filterPriority && c.priority !== filterPriority) return false;
          return true;
        })
        .sort((a, b) => a.sort_order - b.sort_order);
    },
    [cards, filterProjectId, filterPriority]
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (isSelecting) return; // disable drag in selection mode
    const card = cards.find((c) => c.id === event.active.id);
    if (card) setActiveCard(card);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback handled by dnd-kit
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveCard(null);
    if (isSelecting) return; // disable drag in selection mode

    const { active, over } = event;

    if (!over) return;

    const cardId = active.id as string;
    const overId = over.id as string;

    // Determine target column
    let targetColumn: ColumnId;
    let targetIndex: number;

    // Check if dropped on a column directly
    const isColumn = COLUMNS.some((col) => col.id === overId);
    if (isColumn) {
      targetColumn = overId as ColumnId;
      targetIndex = getFilteredCardsByColumn(targetColumn).length;
    } else {
      // Dropped on another card
      const overCard = cards.find((c) => c.id === overId);
      if (!overCard) return;
      targetColumn = overCard.column_id;
      const columnCards = getFilteredCardsByColumn(targetColumn);
      targetIndex = columnCards.findIndex((c) => c.id === overId);
    }

    const activeCardData = cards.find((c) => c.id === cardId);
    if (!activeCardData) return;

    // Skip if nothing changed
    if (activeCardData.column_id === targetColumn) {
      const currentIndex = getFilteredCardsByColumn(targetColumn).findIndex(
        (c) => c.id === cardId
      );
      if (currentIndex === targetIndex) return;
    }

    moveCard(cardId, targetColumn, targetIndex);
  };

  const handleToggleSelecting = () => {
    if (isSelecting) {
      // Exiting selection mode -- clear selection
      clearBulkSelection();
    }
    setIsSelecting((prev) => !prev);
  };

  const handleBulkMove = async (columnId: ColumnId) => {
    await bulkMoveCards(columnId);
    setIsSelecting(false);
  };

  const handleBulkArchive = async () => {
    await bulkArchiveCards();
    setIsSelecting(false);
  };

  const activeFilters = (filterProjectId ? 1 : 0) + (filterPriority ? 1 : 0);
  const totalActive = cards.filter((c) => !c.archived).length;
  const selectedCount = bulkSelectedCardIds.length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Kanban</h1>
          <Badge variant="secondary" className="font-mono text-xs">
            {totalActive} items
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Project filter */}
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All projects</option>
            {projects
              .filter((p) => p.status === "active")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>

          {/* Priority filter */}
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as typeof filterPriority)}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All priorities</option>
            <option value="p1">P1 Critical</option>
            <option value="p2">P2 High</option>
            <option value="p3">P3 Medium</option>
            <option value="p4">P4 Low</option>
          </select>

          {activeFilters > 0 && (
            <button
              onClick={() => {
                setFilterProjectId("");
                setFilterPriority("");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear ({activeFilters})
            </button>
          )}

          {/* Select toggle */}
          <Button
            size="sm"
            variant={isSelecting ? "secondary" : "ghost"}
            onClick={handleToggleSelecting}
            className={isSelecting ? "text-primary" : ""}
          >
            <SquareMousePointer className="mr-1 h-4 w-4" />
            Select
          </Button>

          <Button size="sm" variant="ghost" onClick={() => setTemplatesOpen(true)}>
            <Repeat className="mr-1 h-4 w-4" />
            Templates
          </Button>

          <Button size="sm" variant="ghost" onClick={toggleQuickAdd}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full gap-3">
            {COLUMNS.map((column) => {
              const columnCards = getFilteredCardsByColumn(column.id);
              return (
                <SortableContext
                  key={column.id}
                  items={columnCards.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <KanbanColumn
                    column={column}
                    cards={columnCards}
                    isSelecting={isSelecting}
                    bulkSelectedCardIds={bulkSelectedCardIds}
                    onToggleBulkSelect={toggleBulkSelect}
                    onSelectAllInColumn={selectAllInColumn}
                  />
                </SortableContext>
              );
            })}
          </div>

          <DragOverlay>
            {activeCard ? (
              <KanbanCard card={activeCard} isDragOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Card Templates Panel */}
      <CardTemplates open={templatesOpen} onClose={() => setTemplatesOpen(false)} />

      {/* Floating bulk action bar */}
      {isSelecting && selectedCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-2.5 shadow-lg shadow-black/20">
            <span className="text-sm font-medium text-foreground/80">
              {selectedCount} selected
            </span>

            {/* Move to dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary" className="gap-1.5">
                  Move to
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center">
                {COLUMNS.map((col) => (
                  <DropdownMenuItem
                    key={col.id}
                    onClick={() => handleBulkMove(col.id)}
                  >
                    {col.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Archive */}
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5"
              onClick={handleBulkArchive}
            >
              <Archive className="h-3.5 w-3.5" />
              Archive
            </Button>

            {/* Clear */}
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-muted-foreground"
              onClick={clearBulkSelection}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
