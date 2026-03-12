"use client";

import { useState, useEffect, useCallback } from "react";
import {
  type CardTemplate,
  type Recurrence,
  type Priority,
  RECURRENCE_CONFIG,
  DAY_OF_WEEK_LABELS,
} from "@/lib/types";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Plus,
  Play,
  Pencil,
  Check,
  Trash2,
  Repeat,
  Pause,
  CalendarDays,
} from "lucide-react";
import { format } from "date-fns";

interface CardTemplatesProps {
  open: boolean;
  onClose: () => void;
}

interface TemplateForm {
  title: string;
  description: string;
  project_id: string;
  priority: Priority;
  category: string;
  recurrence: Recurrence;
  day_of_month: number;
  day_of_week: number;
}

const EMPTY_FORM: TemplateForm = {
  title: "",
  description: "",
  project_id: "",
  priority: "p3",
  category: "",
  recurrence: "monthly",
  day_of_month: 1,
  day_of_week: 1,
};

export function CardTemplates({ open, onClose }: CardTemplatesProps) {
  const projects = useStore((s) => s.projects);
  const categories = useStore((s) => s.categories);
  const fetchCards = useStore((s) => s.fetchCards);

  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState<TemplateForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TemplateForm>(EMPTY_FORM);
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/templates");
      if (!res.ok) return;
      const json = await res.json();
      setTemplates(
        (json.templates ?? []).map((t: Record<string, unknown>) => ({
          ...t,
          active: Boolean(t.active),
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) fetchTemplates();
  }, [open, fetchTemplates]);

  const handleCreate = async () => {
    if (!newForm.title.trim()) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newForm,
        project_id: newForm.project_id || null,
      }),
    });
    setShowAdd(false);
    setNewForm(EMPTY_FORM);
    fetchTemplates();
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.title.trim()) return;
    await fetch(`/api/templates/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        project_id: editForm.project_id || null,
      }),
    });
    setEditingId(null);
    fetchTemplates();
  };

  const handleToggleActive = async (t: CardTemplate) => {
    await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: t.active ? 0 : 1 }),
    });
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/templates/${id}`, { method: "DELETE" });
    fetchTemplates();
  };

  const handleGenerate = async (t: CardTemplate) => {
    setGenerating(t.id);
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    await fetch(`/api/templates/${t.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    });
    await Promise.all([fetchTemplates(), fetchCards()]);
    setGenerating(null);
  };

  const handleGenerateAll = async () => {
    const active = templates.filter((t) => t.active);
    if (active.length === 0) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setGenerating("all");
    await Promise.all(
      active.map((t) =>
        fetch(`/api/templates/${t.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month }),
        })
      )
    );
    await Promise.all([fetchTemplates(), fetchCards()]);
    setGenerating(null);
  };

  const startEdit = (t: CardTemplate) => {
    setEditingId(t.id);
    setEditForm({
      title: t.title,
      description: t.description,
      project_id: t.project_id ?? "",
      priority: t.priority,
      category: t.category,
      recurrence: t.recurrence,
      day_of_month: t.day_of_month,
      day_of_week: t.day_of_week,
    });
  };

  const getProjectName = (id: string | null) => {
    if (!id) return "No project";
    return projects.find((p) => p.id === id)?.name ?? "Unknown";
  };

  const getProjectColor = (id: string | null) => {
    if (!id) return "#6c7086";
    return projects.find((p) => p.id === id)?.color ?? "#6c7086";
  };

  if (!open) return null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const activeTemplates = templates.filter((t) => t.active);
  const inactiveTemplates = templates.filter((t) => !t.active);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex w-[520px] flex-col border-l border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Card Templates</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {templates.length} template{templates.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {activeTemplates.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                className="gap-1.5 text-xs"
                disabled={generating === "all"}
                onClick={handleGenerateAll}
              >
                <Play className="h-3 w-3" />
                Generate All ({activeTemplates.length})
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Add New */}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              className="mb-4 flex w-full items-center gap-2 rounded-lg border border-dashed border-border/60 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          ) : (
            <div className="mb-4 rounded-lg border border-border/60 bg-card/40 p-4">
              <TemplateFormFields
                form={newForm}
                onChange={setNewForm}
                projects={activeProjects}
                categories={categories}
              />
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowAdd(false);
                    setNewForm(EMPTY_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!newForm.title.trim()}>
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Active Templates */}
          {activeTemplates.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Active
              </h3>
              <div className="space-y-2">
                {activeTemplates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isEditing={editingId === t.id}
                    editForm={editForm}
                    onEditFormChange={setEditForm}
                    projects={activeProjects}
                    categories={categories}
                    generating={generating === t.id}
                    onStartEdit={startEdit}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDelete}
                    onGenerate={handleGenerate}
                    getProjectName={getProjectName}
                    getProjectColor={getProjectColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Templates */}
          {inactiveTemplates.length > 0 && (
            <div>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Paused
              </h3>
              <div className="space-y-2">
                {inactiveTemplates.map((t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    isEditing={editingId === t.id}
                    editForm={editForm}
                    onEditFormChange={setEditForm}
                    projects={activeProjects}
                    categories={categories}
                    generating={generating === t.id}
                    onStartEdit={startEdit}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onToggleActive={handleToggleActive}
                    onDelete={handleDelete}
                    onGenerate={handleGenerate}
                    getProjectName={getProjectName}
                    getProjectColor={getProjectColor}
                  />
                ))}
              </div>
            </div>
          )}

          {templates.length === 0 && !showAdd && (
            <div className="mt-12 text-center text-sm text-muted-foreground">
              <Repeat className="mx-auto mb-2 h-8 w-8 opacity-30" />
              <p>No templates yet</p>
              <p className="mt-1 text-xs">
                Create templates for recurring cards like monthly deliverables
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Form Fields (shared between create and edit)
// ---------------------------------------------------------------------------

function TemplateFormFields({
  form,
  onChange,
  projects,
  categories,
}: {
  form: TemplateForm;
  onChange: (f: TemplateForm) => void;
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Title</label>
        <Input
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          placeholder="e.g. Review Elite student progress"
          className="h-8 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="Optional card description..."
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Project</label>
          <select
            value={form.project_id}
            onChange={(e) => onChange({ ...form, project_id: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Priority</label>
          <select
            value={form.priority}
            onChange={(e) => onChange({ ...form, priority: e.target.value as Priority })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="p1">P1 Critical</option>
            <option value="p2">P2 High</option>
            <option value="p3">P3 Medium</option>
            <option value="p4">P4 Low</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Category</label>
          <select
            value={form.category}
            onChange={(e) => onChange({ ...form, category: e.target.value })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Recurrence</label>
          <select
            value={form.recurrence}
            onChange={(e) => onChange({ ...form, recurrence: e.target.value as Recurrence })}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {form.recurrence === "monthly" ? (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Day of Month</label>
            <Input
              type="number"
              min={1}
              max={28}
              value={form.day_of_month}
              onChange={(e) => onChange({ ...form, day_of_month: parseInt(e.target.value) || 1 })}
              className="h-8 text-xs"
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Day of Week</label>
            <select
              value={form.day_of_week}
              onChange={(e) => onChange({ ...form, day_of_week: parseInt(e.target.value) })}
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {DAY_OF_WEEK_LABELS.map((day, i) => (
                <option key={i} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Template Row
// ---------------------------------------------------------------------------

function TemplateRow({
  template: t,
  isEditing,
  editForm,
  onEditFormChange,
  projects,
  categories,
  generating,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleActive,
  onDelete,
  onGenerate,
  getProjectName,
  getProjectColor,
}: {
  template: CardTemplate;
  isEditing: boolean;
  editForm: TemplateForm;
  onEditFormChange: (f: TemplateForm) => void;
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  generating: boolean;
  onStartEdit: (t: CardTemplate) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onToggleActive: (t: CardTemplate) => void;
  onDelete: (id: string) => void;
  onGenerate: (t: CardTemplate) => void;
  getProjectName: (id: string | null) => string;
  getProjectColor: (id: string | null) => string;
}) {
  const recCfg = RECURRENCE_CONFIG[t.recurrence];
  const priColors: Record<string, string> = {
    p1: "#f87171",
    p2: "#fb923c",
    p3: "#60a5fa",
    p4: "#71717a",
  };
  const priColor = priColors[t.priority] ?? "#6c7086";

  if (isEditing) {
    return (
      <div className="rounded-lg border border-primary/30 bg-card/40 p-4">
        <TemplateFormFields
          form={editForm}
          onChange={onEditFormChange}
          projects={projects}
          categories={categories}
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSaveEdit}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group rounded-lg border border-border/50 bg-card/40 p-3 transition-colors hover:border-border",
        !t.active && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t.title}</span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
              style={{
                backgroundColor: `${priColor}20`,
                color: priColor,
              }}
            >
              {t.priority.toUpperCase()}
            </span>
          </div>

          {t.description && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground line-clamp-1">
              {t.description}
            </p>
          )}

          <div className="mt-1.5 flex items-center gap-3">
            {/* Project tag */}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getProjectColor(t.project_id) }}
              />
              {getProjectName(t.project_id)}
            </span>

            {/* Recurrence tag */}
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `${recCfg.color}20`,
                color: recCfg.color,
              }}
            >
              {recCfg.label}
              {t.recurrence === "monthly"
                ? ` (day ${t.day_of_month})`
                : ` (${DAY_OF_WEEK_LABELS[t.day_of_week]})`}
            </span>

            {/* Last generated */}
            {t.last_generated && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <CalendarDays className="h-3 w-3" />
                Last: {format(new Date(t.last_generated), "MMM d")}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onGenerate(t)}
            disabled={generating}
            className="rounded p-1 text-emerald-400 transition-colors hover:bg-emerald-400/10"
            title="Generate card now"
          >
            <Play className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onStartEdit(t)}
            className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            title="Edit"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={() => onToggleActive(t)}
            className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
            title={t.active ? "Pause" : "Activate"}
          >
            {t.active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            onClick={() => onDelete(t.id)}
            className="rounded p-1 text-red-400/60 transition-colors hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
