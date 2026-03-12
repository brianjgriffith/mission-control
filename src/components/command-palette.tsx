"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { ASSET_TYPE_CONFIG, type View, type AssetType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Kanban,
  Package,
  Bot,
  Plus,
  Search,
  FolderOpen,
  Map,
  DollarSign,
  Archive,
  Download,
  Keyboard,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const VIEW_ITEMS: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "kanban", label: "Kanban Board", icon: Kanban },
  { id: "assets", label: "Assets", icon: Package },
  { id: "tooling", label: "Claude Tooling", icon: Bot },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "financials", label: "Financials", icon: DollarSign },
  { id: "archive", label: "Archive", icon: Archive },
];

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const setActiveView = useStore((s) => s.setActiveView);
  const setActiveProjectId = useStore((s) => s.setActiveProjectId);
  const toggleQuickAdd = useStore((s) => s.toggleQuickAdd);
  const toggleNewProjectDialog = useStore((s) => s.toggleNewProjectDialog);
  const toggleNewAssetDialog = useStore((s) => s.toggleNewAssetDialog);
  const cards = useStore((s) => s.cards);
  const assets = useStore((s) => s.assets);
  const projects = useStore((s) => s.projects);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const navigateToProject = useStore((s) => s.navigateToProject);

  const activeCards = cards.filter((c) => !c.archived);
  const activeProjects = projects.filter((p) => p.status === "active");

  // Project lookup for badges
  const projectMap: Record<string, { name: string; color: string }> = {};
  for (const p of projects) {
    projectMap[p.id] = { name: p.name, color: p.color };
  }

  const close = () => onOpenChange(false);

  const handleExport = () => {
    close();
    window.open("/api/export", "_blank");
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search tasks, assets, projects..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              close();
              toggleQuickAdd();
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
            <span className="ml-auto text-[10px] text-muted-foreground">
              {"\u2318"}N
            </span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              close();
              toggleNewProjectDialog();
            }}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            New Project
          </CommandItem>
          <CommandItem
            onSelect={() => {
              close();
              toggleNewAssetDialog();
            }}
          >
            <Package className="mr-2 h-4 w-4" />
            New Asset
          </CommandItem>
          <CommandItem onSelect={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export Data
          </CommandItem>
          <CommandItem
            onSelect={() => {
              close();
              // Dispatch custom event to trigger keyboard shortcuts dialog
              window.dispatchEvent(new CustomEvent("open-shortcuts"));
            }}
          >
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard Shortcuts
            <span className="ml-auto text-[10px] text-muted-foreground">?</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="Navigate">
          {VIEW_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem
                key={item.id}
                onSelect={() => {
                  setActiveProjectId(null);
                  setActiveView(item.id);
                  close();
                }}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandSeparator />

        {/* Projects */}
        {activeProjects.length > 0 && (
          <>
            <CommandGroup heading="Projects">
              {activeProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => {
                    navigateToProject(project.id);
                    close();
                  }}
                >
                  <FolderOpen
                    className="mr-2 h-4 w-4"
                    style={{ color: project.color }}
                  />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Cards (searchable) */}
        {activeCards.length > 0 && (
          <>
            <CommandGroup heading="Tasks">
              {activeCards.slice(0, 20).map((card) => {
                const proj = card.project_id ? projectMap[card.project_id] : null;
                return (
                  <CommandItem
                    key={card.id}
                    onSelect={() => {
                      setSelectedCardId(card.id);
                      close();
                    }}
                  >
                    <Search className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{card.title}</span>
                    {proj && (
                      <span
                        className="ml-2 text-[10px]"
                        style={{ color: proj.color }}
                      >
                        {proj.name}
                      </span>
                    )}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {card.priority.toUpperCase()}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Assets (searchable) */}
        {assets.length > 0 && (
          <CommandGroup heading="Assets">
            {assets.slice(0, 15).map((asset) => {
              const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type as AssetType];
              const proj = asset.project_id ? projectMap[asset.project_id] : null;
              return (
                <CommandItem
                  key={asset.id}
                  onSelect={() => {
                    setSelectedAssetId(asset.id);
                    close();
                  }}
                >
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{asset.name}</span>
                  {proj && (
                    <span
                      className="ml-2 text-[10px]"
                      style={{ color: proj.color }}
                    >
                      {proj.name}
                    </span>
                  )}
                  <span
                    className={cn("ml-2 text-[10px]", typeConfig?.color)}
                  >
                    {typeConfig?.label}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
