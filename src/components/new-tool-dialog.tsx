"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bot, Wand2 } from "lucide-react";

interface NewToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (assetId: string) => void;
}

const TOOL_TYPES = [
  { id: "skill" as const, label: "Skill", icon: Wand2 },
  { id: "agent" as const, label: "Agent", icon: Bot },
];

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function NewToolDialog({ open, onOpenChange, onCreated }: NewToolDialogProps) {
  const [type, setType] = useState<"skill" | "agent">("skill");
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("general");
  const [content, setContent] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Fetch existing agent categories (directories under ~/.claude/agents/)
  useEffect(() => {
    if (!open) return;
    fetch("/api/tooling/create")
      .then(() => {
        // The GET endpoint doesn't exist, we'll populate defaults
      })
      .catch(() => {});
    // Default categories
    setCategories(["general", "engineering", "product", "design", "operations"]);
  }, [open]);

  // Auto-generate slug from display name
  useEffect(() => {
    if (!slugManual) {
      setSlug(toKebab(displayName));
    }
  }, [displayName, slugManual]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setType("skill");
      setDisplayName("");
      setSlug("");
      setSlugManual(false);
      setDescription("");
      setCategory("general");
      setContent("");
      setError("");
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !slug || !description.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/tooling/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: slug,
          displayName: displayName.trim(),
          description: description.trim(),
          content: content.trim() || undefined,
          category: type === "agent" ? category : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create tool");
        return;
      }

      const data = await res.json();
      onOpenChange(false);
      onCreated?.(data.asset?.id);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = displayName.trim() && slug && description.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            New Tool
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selector */}
          <div className="flex gap-2">
            {TOOL_TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                    type === t.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground/70"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Display Name */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Display Name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={type === "skill" ? "e.g., Code Review Helper" : "e.g., Backend Architect"}
              className="text-sm"
              autoFocus
            />
          </div>

          {/* Slug */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Slug (file name)
            </label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              placeholder="auto-generated-from-name"
              className="font-mono text-sm"
            />
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              {type === "skill"
                ? `~/.claude/skills/${slug || "..."}/SKILL.md`
                : `~/.claude/agents/${category}/${slug || "..."}.md`}
            </p>
          </div>

          {/* Category (agents only) */}
          {type === "agent" && (
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-secondary px-2 py-1.5 text-xs text-foreground"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this tool do? When should it be used?"
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Content */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Content{" "}
              <span className="text-muted-foreground/40">(optional)</span>
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Initial markdown content for the tool file..."
              className="min-h-[80px] resize-y font-mono text-xs"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!isValid || submitting}
            >
              {submitting ? "Creating..." : `Create ${type === "skill" ? "Skill" : "Agent"}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
