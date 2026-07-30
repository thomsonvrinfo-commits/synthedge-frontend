import React, { useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Maximize } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating zoom controls with press-and-hold continuous zoom.
 * Props: onZoomIn, onZoomOut, onReset, onFitAll
 */
export default function FloatingZoomControls({ onZoomIn, onZoomOut, onReset, onFitAll }) {
  const holdRef = useRef(null);

  const startHold = useCallback((action) => {
    // Fire once immediately, then repeat while held
    action();
    let delay = 300;
    const repeat = () => {
      action();
      delay = Math.max(40, delay * 0.85); // accelerate over time
      holdRef.current = setTimeout(repeat, delay);
    };
    holdRef.current = setTimeout(repeat, delay);
  }, []);

  const stopHold = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }, []);

  const holdProps = (action) => ({
    onMouseDown: (e) => { e.preventDefault(); startHold(action); },
    onMouseUp: stopHold,
    onMouseLeave: stopHold,
    onTouchStart: (e) => { e.preventDefault(); startHold(action); },
    onTouchEnd: stopHold,
  });

  const btnClass = "flex items-center justify-center w-7 h-7 rounded-lg bg-card/90 backdrop-blur-sm border border-border hover:bg-secondary hover:border-primary/50 active:scale-90 transition-all text-muted-foreground hover:text-foreground select-none";

  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1 opacity-40 hover:opacity-95 transition-opacity">
      <button
        {...holdProps(onZoomIn)}
        title="Zoom In [+] — hold to continue"
        className={btnClass}
      >
        <ZoomIn className="w-3.5 h-3.5 pointer-events-none" />
      </button>

      <button
        {...holdProps(onZoomOut)}
        title="Zoom Out [-] — hold to continue"
        className={btnClass}
      >
        <ZoomOut className="w-3.5 h-3.5 pointer-events-none" />
      </button>

      <button
        onClick={onReset}
        title="Reset View [0]"
        className={btnClass}
      >
        <RotateCcw className="w-3 h-3 pointer-events-none" />
      </button>

      {onFitAll && (
        <button
          onClick={onFitAll}
          title="Fit All Replay Data [Alt+A]"
          className={cn(btnClass, "mt-0.5")}
        >
          <Maximize className="w-3 h-3 pointer-events-none" />
        </button>
      )}
    </div>
  );
}