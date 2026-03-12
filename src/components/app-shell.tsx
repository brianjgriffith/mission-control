"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/sidebar";
import { DashboardView } from "@/components/views/dashboard";
import { KanbanView } from "@/components/views/kanban";
import { RoadmapView } from "@/components/views/roadmap";
import { FinancialsView } from "@/components/views/financials";
import { SalesView } from "@/components/views/sales";
import { AssetsView } from "@/components/views/assets";
import { ToolingView } from "@/components/views/tooling";
import { ProjectDetailView } from "@/components/views/project-detail";
import { ArchiveView } from "@/components/views/archive";
import { CalendarView } from "@/components/views/calendar";
import { StudentsView } from "@/components/views/students";
import { MarketingView } from "@/components/views/marketing";
import { CommandPalette } from "@/components/command-palette";
import { QuickAdd } from "@/components/quick-add";
import { CardDetail } from "@/components/card-detail";
import { AssetDetail } from "@/components/asset-detail";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { NewAssetDialog } from "@/components/new-asset-dialog";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { useStore } from "@/lib/store";
import type { View } from "@/lib/types";

export function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const isCommandPaletteOpen = useStore((s) => s.isCommandPaletteOpen);
  const toggleCommandPalette = useStore((s) => s.toggleCommandPalette);
  const isQuickAddOpen = useStore((s) => s.isQuickAddOpen);
  const toggleQuickAdd = useStore((s) => s.toggleQuickAdd);
  const selectedCardId = useStore((s) => s.selectedCardId);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const selectedAssetId = useStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const fetchCards = useStore((s) => s.fetchCards);
  const fetchCategories = useStore((s) => s.fetchCategories);
  const fetchActivity = useStore((s) => s.fetchActivity);
  const fetchProjects = useStore((s) => s.fetchProjects);
  const fetchAssets = useStore((s) => s.fetchAssets);
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);
  const navigateToProject = useStore((s) => s.navigateToProject);
  const setActiveProjectId = useStore((s) => s.setActiveProjectId);
  const reorderProjects = useStore((s) => s.reorderProjects);
  const isNewProjectDialogOpen = useStore((s) => s.isNewProjectDialogOpen);
  const toggleNewProjectDialog = useStore((s) => s.toggleNewProjectDialog);
  const isNewAssetDialogOpen = useStore((s) => s.isNewAssetDialogOpen);
  const toggleNewAssetDialog = useStore((s) => s.toggleNewAssetDialog);

  // Initial data fetch
  useEffect(() => {
    fetchCards();
    fetchCategories();
    fetchActivity();
    fetchProjects();
    fetchAssets();
  }, [fetchCards, fetchCategories, fetchActivity, fetchProjects, fetchAssets]);

  // When navigating to a global view, clear active project
  const handleViewChange = useCallback(
    (view: View) => {
      setActiveProjectId(null);
      setActiveView(view);
    },
    [setActiveProjectId, setActiveView]
  );

  // Global keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd+K - Command palette
      if (isMod && e.key === "k") {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }

      // Cmd+N - Quick add
      if (isMod && e.key === "n") {
        e.preventDefault();
        toggleQuickAdd();
        return;
      }

      // Cmd+1-9,0 - View switching
      if (isMod && e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const views: View[] = ["dashboard", "kanban", "assets", "tooling", "roadmap", "financials", "sales", "calendar", "students", "marketing"];
        const idx = e.key === "0" ? 9 : parseInt(e.key) - 1;
        if (idx < views.length) handleViewChange(views[idx]);
        return;
      }

      // ? - Keyboard shortcuts (only when not in an input)
      if (
        e.key === "?" &&
        !isMod &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      // Escape - Close detail panels
      if (e.key === "Escape") {
        if (selectedAssetId) {
          setSelectedAssetId(null);
          return;
        }
        if (selectedCardId) {
          setSelectedCardId(null);
          return;
        }
      }
    },
    [
      toggleCommandPalette,
      toggleQuickAdd,
      handleViewChange,
      selectedCardId,
      setSelectedCardId,
      selectedAssetId,
      setSelectedAssetId,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Listen for custom event from command palette to open shortcuts
  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener("open-shortcuts", handler);
    return () => window.removeEventListener("open-shortcuts", handler);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardView />;
      case "kanban":
        return <KanbanView />;
      case "roadmap":
        return <RoadmapView />;
      case "financials":
        return <FinancialsView />;
      case "sales":
        return <SalesView />;
      case "assets":
        return <AssetsView />;
      case "tooling":
        return <ToolingView />;
      case "project_detail":
        return <ProjectDetailView />;
      case "calendar":
        return <CalendarView />;
      case "archive":
        return <ArchiveView />;
      case "students":
        return <StudentsView />;
      case "marketing":
        return <MarketingView />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        projects={projects}
        activeProjectId={activeProjectId}
        onProjectClick={navigateToProject}
        onNewProject={toggleNewProjectDialog}
        onReorderProjects={reorderProjects}
      />

      <main className="flex-1 overflow-hidden">
        {renderView()}
      </main>

      {/* Card Detail Slide-over */}
      {selectedCardId && (
        <CardDetail
          cardId={selectedCardId}
          onClose={() => setSelectedCardId(null)}
        />
      )}

      {/* Asset Detail Slide-over */}
      {selectedAssetId && (
        <AssetDetail
          assetId={selectedAssetId}
          onClose={() => setSelectedAssetId(null)}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        open={isCommandPaletteOpen}
        onOpenChange={(open) => {
          if (!open) toggleCommandPalette();
        }}
      />

      {/* Quick Add Dialog */}
      <QuickAdd
        open={isQuickAddOpen}
        onOpenChange={(open) => {
          if (!open) toggleQuickAdd();
        }}
      />

      {/* New Project Dialog */}
      <NewProjectDialog
        open={isNewProjectDialogOpen}
        onOpenChange={(open) => {
          if (!open) toggleNewProjectDialog();
        }}
      />

      {/* New Asset Dialog */}
      <NewAssetDialog
        open={isNewAssetDialogOpen}
        onOpenChange={(open) => {
          if (!open) toggleNewAssetDialog();
        }}
      />

      {/* Keyboard Shortcuts */}
      <KeyboardShortcuts
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
