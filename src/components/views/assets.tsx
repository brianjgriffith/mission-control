"use client";

import { useStore } from "@/lib/store";
import { ASSET_TYPE_CONFIG, ASSET_STATUS_CONFIG, type AssetType, type AssetStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  GitBranch,
  Mail,
  PenSquare,
  Wand2,
  Bot,
  Server,
  Package,
  Plus,
  ExternalLink,
  Search,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function AssetsView() {
  const assets = useStore((s) => s.assets);
  const projects = useStore((s) => s.projects);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const toggleNewAssetDialog = useStore((s) => s.toggleNewAssetDialog);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<AssetType | "">("");
  const [filterStatus, setFilterStatus] = useState<AssetStatus | "">("");
  const [filterProjectId, setFilterProjectId] = useState("");

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterType && a.asset_type !== filterType) return false;
      if (filterStatus && a.status !== filterStatus) return false;
      if (filterProjectId && a.project_id !== filterProjectId) return false;
      return true;
    });
  }, [assets, searchQuery, filterType, filterStatus, filterProjectId]);

  const projectMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    for (const p of projects) {
      map[p.id] = { name: p.name, color: p.color };
    }
    return map;
  }, [projects]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Assets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} asset{filtered.length !== 1 ? "s" : ""} across all projects
            </p>
          </div>
          <Button size="sm" onClick={toggleNewAssetDialog}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Asset
          </Button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search assets..."
              className="h-8 pl-8 text-xs"
            />
          </div>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All Projects</option>
            {projects.filter((p) => p.status === "active").map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AssetType | "")}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All Types</option>
            {Object.entries(ASSET_TYPE_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as AssetStatus | "")}
            className="h-8 rounded-md border border-input bg-secondary px-2 text-xs text-foreground"
          >
            <option value="">All Statuses</option>
            {Object.entries(ASSET_STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>

        {/* Asset Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((asset) => {
              const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type as AssetType];
              const statusConfig = ASSET_STATUS_CONFIG[asset.status as AssetStatus];
              const Icon = ASSET_ICONS[typeConfig?.icon] ?? Package;
              const proj = projectMap[asset.project_id];

              return (
                <button
                  key={asset.id}
                  onClick={() => setSelectedAssetId(asset.id)}
                  className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/40 p-4 text-left transition-colors hover:bg-card/60"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4 shrink-0", typeConfig?.color)} />
                      <span className="text-sm font-medium leading-tight">{asset.name}</span>
                    </div>
                    {asset.url && (
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                    )}
                  </div>
                  {asset.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {asset.description}
                    </p>
                  )}
                  <div className="mt-auto flex items-center gap-2">
                    {proj && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: proj.color + "20",
                          color: proj.color,
                        }}
                      >
                        {proj.name}
                      </span>
                    )}
                    <span className={cn("text-[10px]", statusConfig?.color)}>
                      {statusConfig?.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      {typeConfig?.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 px-4 py-16 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">
              {searchQuery || filterType || filterStatus || filterProjectId
                ? "No assets match your filters"
                : "No assets yet"}
            </p>
            <button
              onClick={toggleNewAssetDialog}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Create your first asset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
