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
import { PROJECT_TYPE_CONFIG, type ProjectType } from "@/lib/types";
import { cn } from "@/lib/utils";

const COLORS = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#22c55e", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#ec4899", label: "Pink" },
  { value: "#06b6d4", label: "Cyan" },
];

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open, onOpenChange }: NewProjectDialogProps) {
  const createProject = useStore((s) => s.createProject);
  const navigateToProject = useStore((s) => s.navigateToProject);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("client");
  const [color, setColor] = useState("#3b82f6");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await createProject({
      name: name.trim(),
      description,
      project_type: projectType,
      color,
    });

    // Navigate to the new project (fetch will have updated the list)
    const projects = useStore.getState().projects;
    const newProject = projects.find(
      (p) => p.name === name.trim()
    );
    if (newProject) {
      navigateToProject(newProject.id);
    }

    // Reset
    setName("");
    setDescription("");
    setProjectType("client");
    setColor("#3b82f6");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Project Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., New Client Project"
              className="text-sm"
              autoFocus
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
              placeholder="What is this project about?"
              className="min-h-[60px] resize-none text-sm"
            />
          </div>

          {/* Project Type */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Type
            </label>
            <div className="flex gap-1.5">
              {(Object.entries(PROJECT_TYPE_CONFIG) as [ProjectType, { label: string }][]).map(
                ([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setProjectType(key)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs transition-colors",
                      projectType === key
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground/50 hover:bg-secondary/50"
                    )}
                  >
                    {config.label}
                  </button>
                )
              )}
            </div>
          </div>

          {/* Color Picker */}
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">
              Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-all",
                    color === c.value
                      ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "hover:scale-110"
                  )}
                  style={{ backgroundColor: c.value }}
                />
              ))}
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
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Create Project
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
