import React, { useState } from "react";
import { cn } from "@/lib/utils";
import {
  MousePointer, Minus, MoveVertical, TrendingUp, Square,
  GitBranch, ArrowRight, ArrowRightToLine, Spline, Type, TrendingDown, Trash2, ChevronRight, ChevronLeft
} from "lucide-react";

// TrendingUp = Long, TrendingDown = Short
const TOOLS = [
  { id: "select",   icon: MousePointer,   label: "Select",       shortcut: "S", group: "select" },
  null, // divider
  { id: "hline",    icon: Minus,          label: "H-Line",       shortcut: "H", group: "draw" },
  { id: "ray",      icon: ArrowRightToLine, label: "Ray",        shortcut: "Y", group: "draw" },
  { id: "vline",    icon: MoveVertical,   label: "V-Line",       shortcut: "V", group: "draw" },
  { id: "tline",    icon: TrendingUp,     label: "Trend",        shortcut: "T", group: "draw" },
  { id: "path",     icon: Spline,         label: "Path",         shortcut: "P", group: "draw" },
  { id: "rect",     icon: Square,         label: "Zone",         shortcut: "Z", group: "draw" },
  { id: "fib",      icon: GitBranch,      label: "Fibonacci",    shortcut: "B", group: "draw" },
  { id: "arrow",    icon: ArrowRight,     label: "Arrow",        shortcut: "A", group: "draw" },
  { id: "text",     icon: Type,           label: "Label",        shortcut: "L", group: "draw" },
  null, // divider
  { id: "long",     icon: TrendingUp,     label: "Long",         shortcut: "G", group: "trade", color: "success" },
  { id: "short",    icon: TrendingDown,   label: "Short",        shortcut: "R", group: "trade", color: "destructive" },
];

export default function FloatingToolbar({ activeTool, onToolChange, onClearAll, drawingCount, isMobile }) {
  const [expanded, setExpanded] = useState(!isMobile);

  return (
    <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-8 h-8 rounded-lg bg-card/90 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
        title={expanded ? "Collapse toolbar" : "Expand toolbar"}
      >
        {expanded ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="flex flex-col gap-0.5 bg-card/90 backdrop-blur-sm border border-border rounded-xl shadow-xl p-1">
          {TOOLS.map((tool, i) => {
            if (tool === null) {
              return <div key={`div-${i}`} className="h-px bg-border my-0.5 mx-1" />;
            }
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => onToolChange(tool.id)}
                title={`${tool.label} [${tool.shortcut}]`}
                className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center transition-all relative",
                  isActive
                    ? tool.color === "success"
                      ? "bg-success/20 text-success ring-1 ring-success/50"
                      : tool.color === "destructive"
                        ? "bg-destructive/20 text-destructive ring-1 ring-destructive/50"
                        : "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="w-4 h-4" />
                {isActive && tool.group !== "select" && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                )}
              </button>
            );
          })}

          {drawingCount > 0 && (
            <>
              <div className="h-px bg-border my-0.5" />
              <button
                onClick={onClearAll}
                title={`Clear all drawings (${drawingCount})`}
                className="w-10 h-10 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
