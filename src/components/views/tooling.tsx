"use client";

import { ASSET_TYPE_CONFIG, type AssetType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Bot,
  Wand2,
  Server,
  Package,
  Plus,
  Clock,
  GitFork,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { NewToolDialog } from "@/components/new-tool-dialog";

const TOOLING_ICONS: Record<string, typeof Bot> = {
  Bot,
  Wand2,
  Server,
  Package,
};

const FREQUENCY_LABELS: Record<string, { label: string; color: string }> = {
  daily: { label: "Daily", color: "text-emerald-400" },
  weekly: { label: "Weekly", color: "text-blue-400" },
  occasional: { label: "Occasional", color: "text-amber-400" },
  rare: { label: "Rare", color: "text-zinc-500" },
  unknown: { label: "Unknown", color: "text-zinc-600" },
};

const TABS: { id: AssetType; label: string; icon: typeof Bot }[] = [
  { id: "skill", label: "Skills", icon: Wand2 },
  { id: "agent", label: "Agents", icon: Bot },
  { id: "mcp_server", label: "MCP Servers", icon: Server },
];

interface ToolingAsset {
  id: string;
  name: string;
  description: string;
  url: string;
  asset_type: string;
  status: string;
  performance_notes: string;
  metadata: {
    repo_path: string;
    usage_frequency: string;
    optimization_notes: string;
  } | null;
}

export function ToolingView() {
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const [activeTab, setActiveTab] = useState<AssetType>("skill");
  const [toolingAssets, setToolingAssets] = useState<ToolingAsset[]>([]);
  const [newToolOpen, setNewToolOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchTooling = useCallback(async () => {
    try {
      const res = await fetch("/api/tooling");
      const data = await res.json();
      setToolingAssets(data.assets ?? []);
    } catch (err) {
      console.error("[ToolingView] fetch:", err);
    }
  }, []);

  useEffect(() => {
    fetchTooling();
  }, [fetchTooling]);

  // Sync from disk
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/tooling/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(
          data.added > 0
            ? `Added ${data.added} new tool${data.added !== 1 ? "s" : ""}`
            : "Everything up to date"
        );
        if (data.added > 0) fetchTooling();
      } else {
        setSyncResult(data.error || "Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    } finally {
      setSyncing(false);
      // Clear message after a few seconds
      setTimeout(() => setSyncResult(null), 4000);
    }
  }, [fetchTooling]);

  // Handle new tool created
  const handleToolCreated = useCallback(
    (assetId?: string) => {
      fetchTooling();
      if (assetId) setSelectedAssetId(assetId);
    },
    [fetchTooling, setSelectedAssetId]
  );

  // Group by asset_type
  const grouped = useMemo(() => {
    const groups: Record<string, ToolingAsset[]> = {};
    for (const a of toolingAssets) {
      const type = a.asset_type;
      if (!groups[type]) groups[type] = [];
      groups[type].push(a);
    }
    return groups;
  }, [toolingAssets]);

  const tabItems = grouped[activeTab] ?? [];
  const tabConfig = ASSET_TYPE_CONFIG[activeTab];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Claude Tooling
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {toolingAssets.length} tool{toolingAssets.length !== 1 ? "s" : ""} in your AI toolkit
            </p>
          </div>
          <div className="flex items-center gap-2">
            {syncResult && (
              <span className="text-xs text-muted-foreground">{syncResult}</span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSync}
              disabled={syncing}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
              Sync from Disk
            </Button>
            <Button size="sm" onClick={() => setNewToolOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Tool
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-1 rounded-lg border border-border/50 bg-card/20 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const count = (grouped[tab.id] ?? []).length;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground/70"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/50 text-muted-foreground/60"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {tabItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tabItems.map((asset) => {
              const Icon = TOOLING_ICONS[tabConfig.icon] ?? Package;
              const freqKey = asset.metadata?.usage_frequency ?? "unknown";
              const freq = FREQUENCY_LABELS[freqKey] ?? FREQUENCY_LABELS.unknown;
              return (
                <button
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 p-4 text-left transition-colors hover:bg-card/60"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4 shrink-0", tabConfig.color)} />
                    <span className="flex-1 truncate text-sm font-medium">{asset.name}</span>
                    {asset.status === "draft" && (
                      <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                        Draft
                      </span>
                    )}
                  </div>
                  {asset.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {asset.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-3 text-[10px]">
                    <span className={cn("flex items-center gap-1", freq.color)}>
                      <Clock className="h-3 w-3" />
                      {freq.label}
                    </span>
                    {asset.metadata?.repo_path && (
                      <span className="flex items-center gap-1 text-muted-foreground/50">
                        <GitFork className="h-3 w-3" />
                        Repo
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 px-4 py-16 text-center">
            <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">
              No {TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} yet
            </p>
            <button
              onClick={() => setNewToolOpen(true)}
              className="mt-3 text-xs text-primary hover:underline"
            >
              Add one
            </button>
          </div>
        )}
      </div>

      {/* New Tool Dialog */}
      <NewToolDialog
        open={newToolOpen}
        onOpenChange={setNewToolOpen}
        onCreated={handleToolCreated}
      />
    </div>
  );
}
