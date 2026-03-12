"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUT_GROUPS = [
  {
    label: "Navigation",
    shortcuts: [
      { keys: ["Cmd", "1"], description: "Dashboard" },
      { keys: ["Cmd", "2"], description: "Kanban Board" },
      { keys: ["Cmd", "3"], description: "Assets" },
      { keys: ["Cmd", "4"], description: "Tooling" },
      { keys: ["Cmd", "5"], description: "Roadmap" },
      { keys: ["Cmd", "6"], description: "Financials" },
    ],
  },
  {
    label: "Actions",
    shortcuts: [
      { keys: ["Cmd", "K"], description: "Command Palette" },
      { keys: ["Cmd", "N"], description: "Quick Add Task" },
      { keys: ["?"], description: "Keyboard Shortcuts" },
    ],
  },
  {
    label: "Panels",
    shortcuts: [
      { keys: ["Esc"], description: "Close Detail Panel" },
    ],
  },
];

export function KeyboardShortcuts({
  open,
  onOpenChange,
}: KeyboardShortcutsProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between rounded-md px-2 py-1.5"
                  >
                    <span className="text-xs text-foreground/70">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="inline-flex min-w-[24px] items-center justify-center rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {key === "Cmd" ? "\u2318" : key}
                          </kbd>
                          {i < shortcut.keys.length - 1 && (
                            <span className="mx-0.5 text-[10px] text-muted-foreground/30">
                              +
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
