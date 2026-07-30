import React from "react";
import { cn } from "@/lib/utils";
import { Minus, TrendingUp, Square, Type, ArrowRight, Trash2, MousePointer,
  MoveVertical, Target, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

export const DRAWING_TOOLS = [
  { id: "select",    icon: MousePointer, label: "Select",     shortcut: "S" },
  { id: "hline",     icon: Minus,        label: "H-Line",     shortcut: "H" },
  { id: "vline",     icon: MoveVertical, label: "V-Line",     shortcut: "V" },
  { id: "tline",     icon: TrendingUp,   label: "Trend",      shortcut: "T" },
  { id: "rect",      icon: Square,       label: "Zone",       shortcut: "Z" },
  { id: "fib",       icon: GitBranch,    label: "Fib",        shortcut: "B" },
  { id: "arrow",     icon: ArrowRight,   label: "Arrow",      shortcut: "A" },
  { id: "text",      icon: Type,         label: "Label",      shortcut: "L" },
  { id: "position",  icon: Target,       label: "Position",   shortcut: "P" },
];

export default function DrawingToolbar({ activeTool, onToolChange, onClearAll, drawingCount = 0 }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {DRAWING_TOOLS.map(tool => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          title={`${tool.label} [${tool.shortcut}]`}
          className={cn(
            "flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs font-medium transition-all",
            activeTool === tool.id
              ? tool.id === "position"
                ? "bg-warning text-background border-warning"
                : "bg-primary text-primary-foreground border-primary"
              : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
          )}
        >
          <tool.icon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{tool.label}</span>
        </button>
      ))}
      {drawingCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="text-xs gap-1 text-destructive hover:text-destructive h-7 ml-1"
        >
          <Trash2 className="w-3 h-3" /> Clear ({drawingCount})
        </Button>
      )}
    </div>
  );
}