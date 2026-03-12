"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { PRIORITY_CONFIG, type Priority, type ColumnId } from "@/lib/types";
import { cn } from "@/lib/utils";

interface QuickAddProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAdd({ open, onOpenChange }: QuickAddProps) {
  const createCard = useStore((s) => s.createCard);
  const projects = useStore((s) => s.projects);
  const activeProjectId = useStore((s) => s.activeProjectId);

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("p3");
  const [projectId, setProjectId] = useState<string>(activeProjectId ?? "");
  const [targetColumn, setTargetColumn] = useState<ColumnId>("inbox");

  // Reset project to activeProjectId when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setProjectId(activeProjectId ?? "");
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    // Smart parsing: "Fix bug P1 #claude-tooling" -> extracts priority and project
    let parsedTitle = title.trim();
    let parsedPriority = priority;
    let parsedProjectId = projectId;

    // Check for priority markers
    const priorityMatch = parsedTitle.match(/\b(p[1-4])\b/i);
    if (priorityMatch) {
      parsedPriority = priorityMatch[1].toLowerCase() as Priority;
      parsedTitle = parsedTitle.replace(priorityMatch[0], "").trim();
    }

    // Check for #slug tags (matches project slugs)
    const slugMatch = parsedTitle.match(/#([\w-]+)/);
    if (slugMatch) {
      const matchedProject = projects.find(
        (p) => p.slug.toLowerCase() === slugMatch[1].toLowerCase()
      );
      if (matchedProject) {
        parsedProjectId = matchedProject.id;
        parsedTitle = parsedTitle.replace(slugMatch[0], "").trim();
      }
    }

    await createCard({
      title: parsedTitle,
      priority: parsedPriority,
      project_id: parsedProjectId || null,
      column_id: targetColumn,
    });

    // Reset
    setTitle("");
    setPriority("p3");
    setProjectId(activeProjectId ?? "");
    setTargetColumn("inbox");
    onOpenChange(false);
  };

  const activeProjects = projects.filter((p) => p.status === "active");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Quick Add</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder='e.g., "Fix YouTube thumbnail P1 #think-media"'
              className="text-sm"
              autoFocus
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Tip: Include P1-P4 for priority, #project-slug for project
            </p>
          </div>

          {/* Priority Selector */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Priority
            </label>
            <div className="flex gap-1">
              {(
                Object.entries(PRIORITY_CONFIG) as [
                  Priority,
                  (typeof PRIORITY_CONFIG)["p1"]
                ][]
              ).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPriority(key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 font-mono text-xs uppercase transition-colors",
                    priority === key
                      ? cn("bg-secondary", config.color)
                      : "text-muted-foreground/50 hover:bg-secondary/50"
                  )}
                >
                  {key} {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Project & Column */}
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
                <option value="">No project</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Add to
              </label>
              <select
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value as ColumnId)}
                className="w-full rounded-md border border-input bg-secondary px-2 py-1.5 text-xs text-foreground"
              >
                <option value="inbox">Inbox</option>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
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
            <Button type="submit" size="sm" disabled={!title.trim()}>
              Add Task
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
