import React, { useState } from "react";
import { X, Zap, Upload, Camera, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import TradeForm from "@/components/journal/TradeForm";
import QuickLogForm from "@/components/journal/v2/QuickLogForm";
import QuickReflection from "@/components/journal/v2/QuickReflection";

const OPTIONS = [
  {
    key: "quicklog",
    icon: Zap,
    label: "⚡ Quick Log",
    desc: "Log a trade manually in seconds.",
    color: "border-primary/40 hover:border-primary bg-primary/5",
    featured: true,
  },
  {
    key: "csv",
    icon: Upload,
    label: "📥 Import CSV",
    desc: "Upload a CSV from Deriv, MT4, or MT5.",
    color: "border-border opacity-50 cursor-not-allowed",
    comingSoon: true,
  },
  {
    key: "screenshot",
    icon: Camera,
    label: "📷 Screenshot",
    desc: "Upload a chart screenshot for AI extraction.",
    color: "border-border opacity-50 cursor-not-allowed",
    comingSoon: true,
  },
];

export default function LogTradeModal({ open, onClose, onSaved, editTrade, profile, rules }) {
  const [step, setStep] = useState(editTrade ? "quicklog" : "choose");
  // savedTrade holds the newly created trade record for the reflection step
  const [savedTrade, setSavedTrade] = useState(null);

  if (!open) return null;

  const handleClose = () => {
    setStep(editTrade ? "quicklog" : "choose");
    setSavedTrade(null);
    onClose();
  };

  const handleQuickLogSaved = (trade) => {
    setSavedTrade(trade);
    setStep("reflection");
    onSaved(); // invalidate queries immediately so feed updates
  };

  const handleReflectionDone = () => {
    onSaved(); // re-invalidate after reflection fields written
    handleClose();
  };

  const title = {
    choose: "Log a Trade",
    quicklog: editTrade ? "Edit Trade" : "⚡ Quick Log",
    reflection: "Quick Reflection",
    csv: "Import CSV",
    screenshot: "Screenshot",
  }[step] || "Log a Trade";

  const subtitle = {
    choose: "How would you like to log this trade?",
    quicklog: editTrade ? "" : "Journal a trade in under 15 seconds.",
    reflection: "",
  }[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border/60 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/60 sticky top-0 bg-card z-10">
          <div>
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5">
          {/* Step: Choose method */}
          {step === "choose" && (
            <div className="space-y-2.5">
              {OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => !opt.comingSoon && setStep(opt.key)}
                  disabled={opt.comingSoon}
                  className={cn(
                    "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                    opt.color,
                    opt.featured && "ring-1 ring-primary/20"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                    opt.featured ? "bg-primary/20" : "bg-secondary"
                  )}>
                    <opt.icon className={cn("w-5 h-5", opt.featured ? "text-primary" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1">
                    <p className={cn("text-sm font-bold", opt.featured && "text-primary")}>{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                  </div>
                  {opt.comingSoon && (
                    <span className="text-[10px] font-bold text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Step: Quick Log */}
          {step === "quicklog" && !editTrade && (
            <QuickLogForm
              onSaved={handleQuickLogSaved}
              onClose={handleClose}
            />
          )}

          {/* Step: Quick Log — Edit mode (use existing TradeForm) */}
          {step === "quicklog" && editTrade && (
            <TradeForm
              open={true}
              inline={true}
              onClose={handleClose}
              onSaved={() => { onSaved(); handleClose(); }}
              editTrade={editTrade}
              profile={profile}
              rules={rules}
            />
          )}

          {/* Step: Quick Reflection */}
          {step === "reflection" && savedTrade && (
            <QuickReflection
              trade={savedTrade}
              onDone={handleReflectionDone}
            />
          )}

          {/* Step: Import CSV */}
          {step === "csv" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border/60 rounded-2xl p-12 text-center">
                <Upload className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-semibold">Drop your CSV file here</p>
                <p className="text-xs text-muted-foreground mt-1">Supports Deriv, MT4, MT5, and generic CSV</p>
                <button className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">Browse Files</button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">Upload → Detect Broker → Preview Trades → Confirm Import</p>
            </div>
          )}

          {/* Step: Screenshot */}
          {step === "screenshot" && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border/60 rounded-2xl p-12 text-center">
                <Camera className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm font-semibold">Upload Chart Screenshot</p>
                <p className="text-xs text-muted-foreground mt-1">AI will extract symbol, entry, SL, TP, and direction.</p>
                <button className="mt-4 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">Upload Screenshot</button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">AI validates chart → Extracts data → You confirm before saving</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}