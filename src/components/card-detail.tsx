"use client";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import {
  PRIORITY_CONFIG,
  COLUMNS,
  ASSET_TYPE_CONFIG,
  type Priority,
  type ColumnId,
  type Asset,
  type AssetType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  Trash2,
  Calendar,
  Flag,
  FolderOpen,
  Columns3,
  Clock,
  Link2,
  Plus,
  Unlink,
} from "lucide-react";
import { formatDateTimePST } from "@/lib/utils";

interface CardDetailProps {
  cardId: string;
  onClose: () => void;
}

export function CardDetail({ cardId, onClose }: CardDetailProps) {
  const cards = useStore((s) => s.cards);
  const projects = useStore((s) => s.projects);
  const assets = useStore((s) => s.assets);
  const updateCard = useStore((s) => s.updateCard);
  const deleteCard = useStore((s) => s.deleteCard);
  const linkAssetToCard = useStore((s) => s.linkAssetToCard);
  const unlinkAssetFromCard = useStore((s) => s.unlinkAssetFromCard);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);

  const card = cards.find((c) => c.id === cardId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("p3");
  const [projectId, setProjectId] = useState<string>("");
  const [columnId, setColumnId] = useState<ColumnId>("inbox");
  const [dueDate, setDueDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Linked assets state
  const [linkedAssets, setLinkedAssets] = useState<Asset[]>([]);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  const fetchLinkedAssets = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${cardId}`);
      if (!res.ok) return;
      const json = await res.json();
      setLinkedAssets(json.linked_assets ?? []);
    } catch {
      // ignore
    }
  }, [cardId]);

  useEffect(() => {
    if (card) {
      setTitle(card.title);
      setDescription(card.description);
      setPriority(card.priority);
      setProjectId(card.project_id || "");
      setColumnId(card.column_id);
      setDueDate(card.due_date || "");
    }
  }, [card]);

  useEffect(() => {
    fetchLinkedAssets();
  }, [fetchLinkedAssets]);

  if (!card) return null;

  const handleSave = () => {
    updateCard(cardId, {
      title,
      description,
      priority,
      project_id: projectId || null,
      column_id: columnId,
      due_date: dueDate || null,
    });
  };

  const handleDelete = () => {
    if (confirmDelete) {
      deleteCard(cardId);
      onClose();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const handleLinkAsset = async (assetId: string) => {
    await linkAssetToCard(assetId, cardId);
    setShowLinkPicker(false);
    fetchLinkedAssets();
  };

  const handleUnlinkAsset = async (assetId: string) => {
    await unlinkAssetFromCard(assetId, cardId);
    fetchLinkedAssets();
  };

  const hasChanges =
    title !== card.title ||
    description !== card.description ||
    priority !== card.priority ||
    projectId !== (card.project_id || "") ||
    columnId !== card.column_id ||
    dueDate !== (card.due_date || "");

  const activeProjects = projects.filter((p) => p.status === "active");

  // Assets available to link (same project, not already linked)
  const linkedIds = new Set(linkedAssets.map((a) => a.id));
  const linkableAssets = assets.filter(
    (a) =>
      !linkedIds.has(a.id) &&
      (card.project_id ? a.project_id === card.project_id : true)
  );

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[420px] flex-col border-l border-border bg-background shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            Card Detail
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
        {/* Title */}
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          className="mb-4 border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
          placeholder="Card title..."
        />

        {/* Description */}
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleSave}
          className="mb-6 min-h-[100px] resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
          placeholder="Add a description..."
        />

        <Separator className="mb-4" />

        {/* Properties */}
        <div className="space-y-3">
          {/* Status */}
          <div className="flex items-center gap-3">
            <Columns3 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Status</span>
            <select
              value={columnId}
              onChange={(e) => {
                setColumnId(e.target.value as ColumnId);
                updateCard(cardId, { column_id: e.target.value as ColumnId });
              }}
              className="flex-1 rounded-md border border-input bg-secondary px-2 py-1 text-xs text-foreground"
            >
              {COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.title}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-3">
            <Flag className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Priority</span>
            <div className="flex flex-1 gap-1">
              {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG.p1][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setPriority(key);
                      updateCard(cardId, { priority: key });
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 font-mono text-[10px] uppercase transition-colors",
                      priority === key
                        ? cn("bg-secondary", config.color)
                        : "text-muted-foreground/50 hover:text-muted-foreground"
                    )}
                  >
                    {key}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Project */}
          <div className="flex items-center gap-3">
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Project</span>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                updateCard(cardId, { project_id: e.target.value || null });
              }}
              className="flex-1 rounded-md border border-input bg-secondary px-2 py-1 text-xs text-foreground"
            >
              <option value="">None</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Due Date */}
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="w-20 text-xs text-muted-foreground">Due</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                updateCard(cardId, { due_date: e.target.value || null });
              }}
              className="flex-1 rounded-md border border-input bg-secondary px-2 py-1 text-xs text-foreground [color-scheme:dark]"
            />
          </div>
        </div>

        <Separator className="my-4" />

        {/* Linked Assets */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Linked Assets</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {linkedAssets.length}
            </span>
            <button
              onClick={() => setShowLinkPicker(!showLinkPicker)}
              className="ml-auto rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Link Picker */}
          {showLinkPicker && (
            <div className="mb-2 rounded-md border border-border bg-secondary/50 p-2">
              {linkableAssets.length > 0 ? (
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {linkableAssets.map((asset) => {
                    const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type as AssetType];
                    return (
                      <button
                        key={asset.id}
                        onClick={() => handleLinkAsset(asset.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-secondary"
                      >
                        <span className={cn("text-[10px]", typeConfig?.color)}>
                          {typeConfig?.label}
                        </span>
                        <span className="truncate text-foreground/80">
                          {asset.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-[10px] text-muted-foreground/50">
                  No assets available to link
                </p>
              )}
            </div>
          )}

          {/* Linked Asset List */}
          {linkedAssets.length > 0 ? (
            <div className="space-y-1">
              {linkedAssets.map((asset) => {
                const typeConfig = ASSET_TYPE_CONFIG[asset.asset_type as AssetType];
                return (
                  <div
                    key={asset.id}
                    className="flex items-center gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5"
                  >
                    <span className={cn("text-[10px] shrink-0", typeConfig?.color)}>
                      {typeConfig?.label}
                    </span>
                    <button
                      onClick={() => setSelectedAssetId(asset.id)}
                      className="flex-1 truncate text-left text-xs text-foreground/80 hover:text-foreground"
                    >
                      {asset.name}
                    </button>
                    <button
                      onClick={() => handleUnlinkAsset(asset.id)}
                      className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-destructive"
                    >
                      <Unlink className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            !showLinkPicker && (
              <p className="text-[10px] text-muted-foreground/50">
                No linked assets
              </p>
            )
          )}
        </div>

        <Separator className="my-4" />

        {/* Timestamps */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            Created {formatDateTimePST(card.created_at)}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
            <Clock className="h-3 w-3" />
            Updated {formatDateTimePST(card.updated_at)}
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
