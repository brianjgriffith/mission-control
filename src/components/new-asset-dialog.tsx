"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import {
  ASSET_TYPE_CONFIG,
  ASSET_STATUS_CONFIG,
  type AssetType,
  type AssetStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface NewAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewAssetDialog({ open, onOpenChange }: NewAssetDialogProps) {
  const createAsset = useStore((s) => s.createAsset);
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("page");
  const [status, setStatus] = useState<AssetStatus>("draft");
  const [projectId, setProjectId] = useState<string>(activeProjectId ?? "");

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setProjectId(activeProjectId ?? "");
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !projectId) return;

    await createAsset({
      name: name.trim(),
      description,
      url,
      asset_type: assetType,
      status,
      project_id: projectId,
    });

    // Reset
    setName("");
    setDescription("");
    setUrl("");
    setAssetType("page");
    setStatus("draft");
    setProjectId(activeProjectId ?? "");
    onOpenChange(false);
  };

  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">New Asset</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Asset Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Sales Page"
              className="text-sm"
              autoFocus
            />
          </div>

          {/* URL */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this asset..."
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Asset Type */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(ASSET_TYPE_CONFIG) as [AssetType, { label: string; color: string }][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAssetType(key)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs transition-colors",
                      assetType === key
                        ? cn("bg-secondary", config.color)
                        : "text-muted-foreground/50 hover:bg-secondary/50"
                    )}
                  >
                    {config.label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Project & Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Project
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full rounded-md border border-input bg-secondary px-2 py-1.5 text-xs text-foreground"
              >
                <option value="">Select project...</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
                className="w-full rounded-md border border-input bg-secondary px-2 py-1.5 text-xs text-foreground"
              >
                {(Object.entries(ASSET_STATUS_CONFIG) as [AssetStatus, { label: string }][]).map(
                  ([key, config]) => (
                    <option key={key} value={key}>
                      {config.label}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!name.trim() || !projectId}>
              Create Asset
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
