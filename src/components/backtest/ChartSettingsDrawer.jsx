import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { X, RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INDICATOR_CATALOG } from "@/lib/indicatorEngine";

const INDICATOR_CATEGORIES = ["Trend", "Momentum", "Volatility", "Volume"];

const PRESETS = {
  "SynthEdge Default": { bullBody: "#26a69a", bearBody: "#ef5350", bullWick: "#26a69a", bearWick: "#ef5350" },
  "TradingView":        { bullBody: "#26a69a", bearBody: "#ef5350", bullWick: "#26a69a", bearWick: "#ef5350" },
  "MT5 Classic":        { bullBody: "#4472c4", bearBody: "#ef5350", bullWick: "#4472c4", bearWick: "#ef5350" },
  "Deriv Style":        { bullBody: "#00e5ff", bearBody: "#ff1744", bullWick: "#00e5ff", bearWick: "#ff1744" },
  "Monochrome":         { bullBody: "#9e9e9e", bearBody: "#424242", bullWick: "#9e9e9e", bearWick: "#424242" },
};

const DEFAULT_SETTINGS = {
  preset: "SynthEdge Default",
  bullBody: "#26a69a",
  bearBody: "#ef5350",
  bullWick: "#26a69a",
  bearWick: "#ef5350",
  showVolume: true,
  showGrid: true,
  crosshairEnabled: true,
};

export function useChartSettings() {
  const stored = (() => {
    try { return JSON.parse(localStorage.getItem("synthEdgeChartSettings") || "{}"); } catch { return {}; }
  })();
  const [settings, setSettingsState] = useState({ ...DEFAULT_SETTINGS, ...stored });

  const updateSettings = (patch) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("synthEdgeChartSettings", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  return { settings, updateSettings };
}

export default function ChartSettingsDrawer({ open, onClose, settings, onUpdate, activeIndicators, onIndicatorsChange }) {
  const [tab, setTab] = useState("appearance");

  if (!open) return null;

  const applyPreset = (name) => {
    const p = PRESETS[name];
    if (p) onUpdate({ preset: name, ...p });
  };

  const ColorRow = ({ label, field }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className="w-16 h-7 rounded border border-border cursor-pointer relative overflow-hidden"
          style={{ backgroundColor: settings[field] }}
        >
          <input
            type="color"
            value={settings[field]}
            onChange={e => onUpdate({ [field]: e.target.value, preset: "Custom" })}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </div>
      </div>
    </div>
  );

  const Toggle = ({ label, field }) => (
    <div className="flex items-center justify-between py-2 border-b border-border/50">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onUpdate({ [field]: !settings[field] })}
        className={cn(
          "w-10 h-5 rounded-full transition-all relative",
          settings[field] ? "bg-primary" : "bg-secondary"
        )}
      >
        <span className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
          settings[field] ? "left-5" : "left-0.5"
        )} />
      </button>
    </div>
  );

  return (
    <div className="absolute top-0 right-0 bottom-0 w-72 bg-card border-l border-border z-30 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-semibold">Chart Settings</h3>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-2 flex-shrink-0">
        {["appearance", "indicators"].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-2 text-xs font-medium capitalize transition-colors border-b-2 -mb-px",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {tab === "appearance" && (
          <>
            {/* Candle Colors */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Candle Colors</h4>

              {/* Preset selector */}
              <div className="mb-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">Presets</label>
                <select
                  value={settings.preset || "SynthEdge Default"}
                  onChange={e => applyPreset(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg px-2 py-1.5 text-xs text-foreground"
                >
                  {Object.keys(PRESETS).map(p => <option key={p} value={p}>{p}</option>)}
                  {settings.preset === "Custom" && <option value="Custom">Custom</option>}
                </select>
              </div>

              <ColorRow label="Bullish Body"   field="bullBody" />
              <ColorRow label="Bearish Body"   field="bearBody" />
              <ColorRow label="Bullish Wick"   field="bullWick" />
              <ColorRow label="Bearish Wick"   field="bearWick" />
            </div>

            {/* Chart Options */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Chart Options</h4>
              <Toggle label="Show Volume" field="showVolume" />
              <Toggle label="Show Grid"   field="showGrid" />
              <Toggle label="Crosshair"   field="crosshairEnabled" />
            </div>
          </>
        )}

        {tab === "indicators" && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Indicators</h4>
            {INDICATOR_CATEGORIES.map(cat => {
              const items = Object.values(INDICATOR_CATALOG).filter(i => i.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat} className="mb-4">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-1">{cat}</p>
                  {items.map(ind => {
                    const active = (activeIndicators || []).includes(ind.id);
                    return (
                      <button
                        key={ind.id}
                        onClick={() => {
                          const cur = activeIndicators || [];
                          onIndicatorsChange(active ? cur.filter(x => x !== ind.id) : [...cur, ind.id]);
                        }}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: ind.color }} />
                          <span className={active ? "text-foreground" : "text-muted-foreground"}>{ind.label}</span>
                        </div>
                        {active && <Check className="w-3 h-3 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}


      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex-shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs"
          onClick={() => onUpdate(DEFAULT_SETTINGS)}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Default
        </Button>
      </div>
    </div>
  );
}