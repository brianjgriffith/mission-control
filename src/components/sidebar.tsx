"use client";

import { useCallback } from "react";
import {
  LayoutDashboard,
  Kanban,
  Package,
  Bot,
  Archive,
  Settings,
  ChevronLeft,
  ChevronRight,
  Command,
  Plus,
  Video,
  User,
  Home,
  DollarSign,
  TrendingUp,
  Users,
  Map,
  CalendarDays,
  GraduationCap,
  Phone,
  GripVertical,
  Megaphone,
  Activity,
  LogOut,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import type { View, Project } from "@/lib/types";

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  projects: Project[];
  activeProjectId: string | null;
  onProjectClick: (projectId: string) => void;
  onNewProject: () => void;
  onReorderProjects: (projectIds: string[]) => void;
  userName?: string;
  userRole?: string;
  onSignOut?: () => void;
}

const GLOBAL_NAV: { id: View; label: string; icon: typeof LayoutDashboard; shortcut: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, shortcut: "1" },
  { id: "kanban", label: "Kanban", icon: Kanban, shortcut: "2" },
  { id: "assets", label: "Assets", icon: Package, shortcut: "3" },
  { id: "tooling", label: "Tooling", icon: Bot, shortcut: "4" },
  { id: "roadmap", label: "Roadmap", icon: Map, shortcut: "5" },
  { id: "financials", label: "Financials", icon: DollarSign, shortcut: "6" },
  { id: "sales", label: "Sales", icon: TrendingUp, shortcut: "7" },
  { id: "charges", label: "Charges", icon: DollarSign, shortcut: "" },
  { id: "meetings", label: "Meetings", icon: Phone, shortcut: "" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, shortcut: "8" },
  { id: "students", label: "Students", icon: GraduationCap, shortcut: "9" },
  { id: "marketing", label: "Marketing", icon: Megaphone, shortcut: "0" },
];

const SECONDARY_ITEMS = [
  { id: "archive" as const, label: "Archive", icon: Archive },
  { id: "sync_health" as const, label: "Sync Health", icon: Activity },
  { id: "settings" as const, label: "Settings", icon: Settings },
];

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  Bot,
  Video,
  User,
  Home,
  DollarSign,
  Users,
  Package,
};

// ---------------------------------------------------------------------------
// SortableProjectItem -- wraps the existing project button with drag support
// ---------------------------------------------------------------------------

interface SortableProjectItemProps {
  project: Project;
  isActive: boolean;
  onProjectClick: (projectId: string) => void;
}

function SortableProjectItem({ project, isActive, onProjectClick }: SortableProjectItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const ProjectIcon = ICON_MAP[project.icon] ?? Package;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group relative", isDragging && "z-50 opacity-50")}
    >
      <button
        onClick={() => onProjectClick(project.id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        )}
      >
        {/* Drag handle -- visible on hover */}
        <span
          {...attributes}
          {...listeners}
          className="absolute left-0 flex h-full w-5 cursor-grab items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3 w-3 text-sidebar-foreground/30" />
        </span>

        <ProjectIcon
          className="h-4 w-4 shrink-0"
          style={{ color: project.color }}
        />
        <span className="flex-1 truncate text-left">
          {project.name}
        </span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar({
  activeView,
  onViewChange,
  collapsed,
  onToggleCollapse,
  projects,
  activeProjectId,
  onProjectClick,
  onNewProject,
  onReorderProjects,
  userName,
  userRole,
  onSignOut,
}: SidebarProps) {
  const activeProjects = projects.filter((p) => p.status === "active");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = activeProjects.findIndex((p) => p.id === active.id);
      const newIndex = activeProjects.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(activeProjects, oldIndex, newIndex);
      onReorderProjects(reordered.map((p) => p.id));
    },
    [activeProjects, onReorderProjects]
  );

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Logo / App Name — click to toggle sidebar */}
      <button
        onClick={onToggleCollapse}
        className="flex h-12 w-full items-center gap-2 px-3 transition-colors hover:bg-sidebar-accent/50"
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <Command className="h-4 w-4 text-primary" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
            Mission Control
          </span>
        )}
      </button>

      <Separator className="bg-sidebar-border" />

      {/* Global Navigation */}
      <nav className="flex flex-col gap-1 p-2">
        {GLOBAL_NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeView === item.id && activeProjectId === null;

          const button = (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  <kbd className="font-mono text-[10px] text-muted-foreground/50">
                    {item.shortcut}
                  </kbd>
                </>
              )}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right" className="flex items-center gap-2">
                  {item.label}
                  <kbd className="font-mono text-[10px] text-muted-foreground">
                    {item.shortcut}
                  </kbd>
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      <Separator className="mx-2 bg-sidebar-border" />

      {/* Projects Section */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!collapsed && (
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Projects
            </span>
            <button
              onClick={onNewProject}
              className="rounded p-0.5 text-sidebar-foreground/30 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center py-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onNewProject}
                  className="rounded p-1 text-sidebar-foreground/30 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">New Project</TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {collapsed ? (
            /* Collapsed mode: no drag reorder, just render dots with tooltips */
            activeProjects.map((project) => {
              const isActive =
                activeView === "project_detail" &&
                activeProjectId === project.id;

              return (
                <Tooltip key={project.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onProjectClick(project.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <div
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{project.name}</TooltipContent>
                </Tooltip>
              );
            })
          ) : (
            /* Expanded mode: drag-to-reorder with dnd-kit */
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={activeProjects.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                {activeProjects.map((project) => {
                  const isActive =
                    activeView === "project_detail" &&
                    activeProjectId === project.id;

                  return (
                    <SortableProjectItem
                      key={project.id}
                      project={project}
                      isActive={isActive}
                      onProjectClick={onProjectClick}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Separator className="mx-2 bg-sidebar-border" />

      {/* Secondary Nav */}
      <nav className="flex flex-col gap-1 p-2">
        {SECONDARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            (item.id === "archive" && activeView === "archive" && activeProjectId === null) ||
            (item.id === "sync_health" && activeView === "sync_health" && activeProjectId === null);

          const button = (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "archive") onViewChange("archive");
                if (item.id === "sync_health") onViewChange("sync_health");
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/40 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      {/* User / Sign Out */}
      {userName && (
        <div className="border-t border-sidebar-border p-2">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onSignOut}
                  className="flex w-full items-center justify-center rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {userName} — Sign out
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium text-sidebar-foreground/80">
                  {userName}
                </span>
                {userRole && (
                  <span className="text-[10px] capitalize text-sidebar-foreground/40">
                    {userRole.replace("_", " ")}
                  </span>
                )}
              </div>
              <button
                onClick={onSignOut}
                className="rounded p-1 text-sidebar-foreground/30 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapse Toggle */}
      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center rounded-md p-1.5 text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/60"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
