"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import {
  ASSET_TYPE_CONFIG,
  ASSET_STATUS_CONFIG,
  type AssetType,
  type AssetStatus,
  type AssetWithRelations,
  type ToolingMetadata,
  type UsageFrequency,
} from "@/lib/types";
import { cn, formatDateTimePST } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  Trash2,
  ExternalLink,
  FolderOpen,
  Clock,
  Link2,
  Unlink,
  Wrench,
} from "lucide-react";

interface AssetDetailProps {
  assetId: string;
  onClose: () => void;
}

const USAGE_LABELS: Record<UsageFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  occasional: "Occasional",
  rare: "Rare",
  unknown: "Unknown",
};

export function AssetDetail({ assetId, onClose }: AssetDetailProps) {
  const updateAsset = useStore((s) => s.updateAsset);
  const deleteAsset = useStore((s) => s.deleteAsset);
  const unlinkAssetFromCard = useStore((s) => s.unlinkAssetFromCard);
  const setSelectedCardId = useStore((s) => s.setSelectedCardId);
  const projects = useStore((s) => s.projects);

  // Full asset data fetched from the detail API
  const [data, setData] = useState<AssetWithRelations | null>(null);
  const [tooling, setTooling] = useState<ToolingMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("page");
  const [status, setStatus] = useState<AssetStatus>("draft");
  const [performanceNotes, setPerformanceNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tooling fields
  const [repoPath, setRepoPath] = useState("");
  const [usageFrequency, setUsageFrequency] = useState<UsageFrequency>("unknown");
  const [optimizationNotes, setOptimizationNotes] = useState("");

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/assets/${assetId}`);
      if (!res.ok) return;
      const json = await res.json();
      const asset: AssetWithRelations = {
        ...json.asset,
        linked_cards: json.linked_cards ?? [],
        tooling_metadata: json.tooling_metadata ?? null,
        project_name: json.project_name ?? "",
        project_color: json.project_color ?? "",
      };
      setData(asset);
      setTooling(json.tooling_metadata ?? null);

      // Populate form fields
      setName(asset.name);
      setDescription(asset.description);
      setUrl(asset.url);
      setAssetType(asset.asset_type);
      setStatus(asset.status);
      setPerformanceNotes(asset.performance_notes);

      if (json.tooling_metadata) {
        setRepoPath(json.tooling_metadata.repo_path ?? "");
        setUsageFrequency(json.tooling_metadata.usage_frequency ?? "unknown");
        setOptimizationNotes(json.tooling_metadata.optimization_notes ?? "");
      }
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    setLoading(true);
    fetchDetail();
  }, [fetchDetail]);

  if (loading || !data) {
    return (
      <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] items-center justify-center border-l border-border bg-background shadow-2xl shadow-black/20">
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const handleSave = async () => {
    await updateAsset(assetId, {
      name,
      description,
      url,
      asset_type: assetType,
      status,
      performance_notes: performanceNotes,
    });
    fetchDetail();
  };

  const handleSaveTooling = async () => {
    await fetch(`/api/assets/${assetId}/tooling`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repo_path: repoPath,
        usage_frequency: usageFrequency,
        optimization_notes: optimizationNotes,
      }),
    });
    fetchDetail();
  };

  const handleDelete = async () => {
    if (confirmDelete) {
      await deleteAsset(assetId);
      onClose();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const handleUnlink = async (cardId: string) => {
    await unlinkAssetFromCard(assetId, cardId);
    fetchDetail();
  };

  const hasChanges =
    name !== data.name ||
    description !== data.description ||
    url !== data.url ||
    assetType !== data.asset_type ||
    status !== data.status ||
    performanceNotes !== data.performance_notes;

  const hasToolingChanges =
    repoPath !== (tooling?.repo_path ?? "") ||
    usageFrequency !== (tooling?.usage_frequency ?? "unknown") ||
    optimizationNotes !== (tooling?.optimization_notes ?? "");

  const isToolingProject = projects.find(
    (p) => p.id === data.project_id
  )?.project_type === "tooling";

  const typeConfig = ASSET_TYPE_CONFIG[data.asset_type];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border bg-background shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", typeConfig.color)}>
            {typeConfig.label}
          </span>
          {hasChanges && (
            <Badge variant="outline" className="text-[10px] text-primary">
              Unsaved
            </Badge>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Name */}
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSave}
          className="mb-2 border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          placeholder="Asset name..."
        />

        {/* URL */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {url.replace(/^https?:\/\//, "").slice(0, 50)}
          </a>
        )}

        {/* Description */}
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSave}
          className="mb-4 min-h-[80px] resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          placeholder="Add a description..."
        />

        <Separator className="mb-4" />

        {/* Properties */}
        <div className="space-y-3">
          {/* Type */}
          <div className="flex items-center gap-3">
            <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Type</span>
            <div className="flex flex-1 flex-wrap gap-1">
              {(
                Object.entries(ASSET_TYPE_CONFIG) as [
                  AssetType,
                  { label: string; color: string },
                ][]
              ).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => {
                    setAssetType(key);
                    updateAsset(assetId, { asset_type: key });
                    fetchDetail();
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] transition-colors",
                    assetType === key
                      ? cn("bg-secondary", config.color)
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Status</span>
            <div className="flex flex-1 gap-1">
              {(
                Object.entries(ASSET_STATUS_CONFIG) as [
                  AssetStatus,
                  { label: string; color: string },
                ][]
              ).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => {
                    setStatus(key);
                    updateAsset(assetId, { status: key });
                    fetchDetail();
                  }}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] transition-colors",
                    status === key
                      ? cn("bg-secondary", config.color)
                      : "text-muted-foreground/50 hover:text-muted-foreground"
                  )}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project */}
          <div className="flex items-center gap-3">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Project</span>
            <div className="flex items-center gap-2 text-xs">
              {data.project_color && (
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: data.project_color }}
                />
              )}
              <span className="text-foreground/80">{data.project_name || "None"}</span>
            </div>
          </div>

          {/* URL */}
          <div className="flex items-center gap-3">
            <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">URL</span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={handleSave}
              placeholder="https://..."
              className="h-7 flex-1 border-input bg-secondary text-xs"
            />
          </div>
        </div>

        {/* Performance Notes */}
        <div className="mt-4">
          <label className="mb-1.5 block text-xs text-muted-foreground">
            Performance Notes
          </label>
          <Textarea
            value={performanceNotes}
            onChange={(e) => setPerformanceNotes(e.target.value)}
            onBlur={handleSave}
            className="min-h-[60px] resize-none border-input bg-secondary text-xs"
            placeholder="Conversion rates, metrics, observations..."
          />
        </div>

        <Separator className="my-4" />

        {/* Linked Tasks */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Linked Tasks</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {data.linked_cards.length}
            </span>
          </div>
          {data.linked_cards.length > 0 ? (
            <div className="space-y-1">
              {data.linked_cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5"
                >
                  <button
                    onClick={() => setSelectedCardId(card.id)}
                    className="flex-1 truncate text-left text-xs text-foreground/80 hover:text-foreground"
                  >
                    {card.title}
                  </button>
                  <button
                    onClick={() => handleUnlink(card.id)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-destructive"
                  >
                    <Unlink className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/50">
              No linked tasks. Link tasks from the card detail panel.
            </p>
          )}
        </div>

        {/* Tooling Metadata (only for tooling-type projects) */}
        {isToolingProject && (
          <>
            <Separator className="my-4" />
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Tooling Metadata</span>
                {hasToolingChanges && (
                  <Badge variant="outline" className="text-[10px] text-primary">
                    Unsaved
                  </Badge>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    Repo / Path
                  </label>
                  <Input
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    onBlur={handleSaveTooling}
                    placeholder="e.g., ~/.claude/commands/..."
                    className="h-7 border-input bg-secondary text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    Usage Frequency
                  </label>
                  <div className="flex gap-1">
                    {(Object.entries(USAGE_LABELS) as [UsageFrequency, string][]).map(
                      ([key, label]) => (
                        <button
                          key={key}
                          onClick={() => {
                            setUsageFrequency(key);
                            // Save immediately
                            fetch(`/api/assets/${assetId}/tooling`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                repo_path: repoPath,
                                usage_frequency: key,
                                optimization_notes: optimizationNotes,
                              }),
                            }).then(() => fetchDetail());
                          }}
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] transition-colors",
                            usageFrequency === key
                              ? "bg-secondary text-foreground"
                              : "text-muted-foreground/50 hover:text-muted-foreground"
                          )}
                        >
                          {label}
                        </button>
                      )
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">
                    Optimization Notes
                  </label>
                  <Textarea
                    value={optimizationNotes}
                    onChange={(e) => setOptimizationNotes(e.target.value)}
                    onBlur={handleSaveTooling}
                    className="min-h-[60px] resize-none border-input bg-secondary text-xs"
                    placeholder="How could this tool be improved..."
                  />
                </div>
              </div>
            </div>
          </>
        )}

        <Separator className="my-4" />

        {/* Timestamps */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            Created {formatDateTimePST(data.created_at)}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            Updated {formatDateTimePST(data.updated_at)}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          className={cn(
            "text-xs",
            confirmDelete
              ? "text-destructive hover:text-destructive"
              : "text-muted-foreground"
          )}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {confirmDelete ? "Click again to delete" : "Delete"}
        </Button>
        {hasChanges && (
          <Button size="sm" onClick={handleSave} className="text-xs">
            Save
          </Button>
        )}
      </div>
    </div>
  );
}
