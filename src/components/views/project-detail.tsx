"use client";

import { useStore } from "@/lib/store";
import {
  COLUMNS,
  PRIORITY_CONFIG,
  ASSET_TYPE_CONFIG,
  PROJECT_TYPE_CONFIG,
  type AssetType,
  type ProjectType,
  type ProjectStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Inbox,
  Circle,
  Timer,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Package,
  Plus,
  FileText,
  GitBranch,
  Mail,
  PenSquare,
  Wand2,
  Bot,
  Server,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const COLUMN_ICONS = {
  inbox: Inbox,
  todo: Circle,
  in_progress: Timer,
  blocked: AlertCircle,
  done: CheckCircle2,
};

const ASSET_ICONS: Record<string, typeof FileText> = {
  FileText,
  GitBranch,
  Mail,
  PenSquare,
  Wand2,
  Bot,
  Server,
  Package,
};

export function ProjectDetailView() {
  const activeProjectId = useStore((s) => s.activeProjectId);
  const projects = useStore((s) => s.projects);
  const cards = useStore((s) => s.cards);
  const assets = useStore((s) => s.assets);
  const setActiveView = useStore((s) => s.setActiveView);
  const setActiveProjectId = useStore((s) => s.setActiveProjectId);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const toggleQuickAdd = useStore((s) => s.toggleQuickAdd);
  const toggleNewAssetDialog = useStore((s) => s.toggleNewAssetDialog);
  const updateProject = useStore((s) => s.updateProject);

  const [settingsOpen, setSettingsOpen] = useState(false);

  const project = projects.find((p) => p.id === activeProjectId);

  const projectCards = useMemo(
    () => cards.filter((c) => !c.archived && c.project_id === activeProjectId),
    [cards, activeProjectId]
  );

  const projectAssets = useMemo(
    () => assets.filter((a) => a.project_id === activeProjectId),
    [assets, activeProjectId]
  );

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Project not found</p>
      </div>
    );
  }

  // Column stats
  const columnStats = COLUMNS.map((col) => ({
    ...col,
    count: projectCards.filter((c) => c.column_id === col.id).length,
  }));

  // Top priority cards (in_progress + todo)
  const focusCards = projectCards
    .filter((c) => c.column_id === "in_progress" || c.column_id === "todo")
    .sort((a, b) => {
      const po = { p1: 0, p2: 1, p3: 2, p4: 3 };
      return po[a.priority] - po[b.priority];
    })
    .slice(0, 5);

  const handleBack = () => {
    setActiveProjectId(null);
    setActiveView("dashboard");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            All Projects
          </button>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg"
              style={{ backgroundColor: project.color + "20" }}
            >
              <span className="text-lg" style={{ color: project.color }}>
                {project.name.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Column Stats */}
        <div className="mb-6 grid grid-cols-5 gap-2">
          {columnStats.map((stat) => {
            const Icon = COLUMN_ICONS[stat.id];
            return (
              <div
                key={stat.id}
                className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5"
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
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Active Tasks */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Active Tasks</h2>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleQuickAdd}>
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {focusCards.length > 0 ? (
                focusCards.map((card) => {
                  const pri = PRIORITY_CONFIG[card.priority];
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
                          <span className={cn("font-mono text-[10px] uppercase", pri.color)}>
                            {card.priority}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">
                            {card.column_id.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
                  <p className="text-xs text-muted-foreground/50">No active tasks</p>
                </div>
              )}
            </div>
          </div>

          {/* Assets */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Assets
                <span className="ml-1.5 text-xs font-normal text-muted-foreground/50">
                  ({projectAssets.length})
                </span>
              </h2>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={toggleNewAssetDialog}>
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {projectAssets.length > 0 ? (
                projectAssets.map((asset) => {
                  const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type as AssetType];
                  const Icon = ASSET_ICONS[typeConfig?.icon] ?? Package;
                  return (
                    <button
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className="flex w-full items-center gap-3 rounded-lg bg-card/40 px-3 py-2.5 text-left transition-colors hover:bg-card/60"
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", typeConfig?.color)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{asset.name}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {typeConfig?.label}
                        </span>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-border/50 px-4 py-8 text-center">
                  <Package className="mx-auto mb-2 h-5 w-5 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground/50">No assets yet</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Project Settings (collapsible) */}
        <div className="mb-6">
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className="mb-3 flex w-full items-center gap-2 text-sm font-semibold hover:text-foreground/80"
          >
            <Settings className="h-3.5 w-3.5" />
            Project Settings
            {settingsOpen ? (
              <ChevronUp className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          {settingsOpen && (
            <div className="space-y-4 rounded-lg border border-border/50 bg-card/30 p-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Name
                </label>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  defaultValue={project.name}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== project.name) {
                      updateProject(project.id, { name: val });
                    }
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Description
                </label>
                <textarea
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  rows={2}
                  defaultValue={project.description}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val !== project.description) {
                      updateProject(project.id, { description: val });
                    }
                  }}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                {/* Color */}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent"
                      defaultValue={project.color}
                      onChange={(e) => {
                        updateProject(project.id, { color: e.target.value });
                      }}
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.color}
                    </span>
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Type
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    defaultValue={project.project_type}
                    onChange={(e) => {
                      updateProject(project.id, {
                        project_type: e.target.value as ProjectType,
                      });
                    }}
                  >
                    {(Object.entries(PROJECT_TYPE_CONFIG) as [ProjectType, { label: string }][]).map(
                      ([key, cfg]) => (
                        <option key={key} value={key}>
                          {cfg.label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Status
                  </label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    defaultValue={project.status}
                    onChange={(e) => {
                      updateProject(project.id, {
                        status: e.target.value as ProjectStatus,
                      });
                    }}
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator className="my-6" />

        {/* All Cards by Column */}
        <div>
          <h2 className="mb-3 text-sm font-semibold">All Tasks by Status</h2>
          <div className="space-y-4">
            {COLUMNS.filter((col) => col.id !== "done").map((col) => {
              const colCards = projectCards
                .filter((c) => c.column_id === col.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              const Icon = COLUMN_ICONS[col.id];
              if (colCards.length === 0) return null;

              return (
                <div key={col.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={cn("h-3.5 w-3.5", col.color)} />
                    <span className="text-xs font-medium text-muted-foreground">
                      {col.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      ({colCards.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {colCards.map((card) => {
                      const pri = PRIORITY_CONFIG[card.priority];
                      return (
                        <button
                          key={card.id}
                          onClick={() => setSelectedCardId(card.id)}
                          className="flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-card/40"
                        >
                          <span className={cn("font-mono text-[10px] uppercase", pri.color)}>
                            {card.priority}
                          </span>
                          <span className="truncate text-sm">{card.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
