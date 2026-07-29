import React, { useState } from "react";
import { X, FlaskConical, CheckCircle2, AlertTriangle, Rocket } from "lucide-react";

export default function SessionReflectionModal({ open, session, onClose, onComplete }) {
  const [conclusion, setConclusion] = useState("");
  const [whatWorked, setWhatWorked] = useState("");
  const [whatFailed, setWhatFailed] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!conclusion.trim()) return;
    setSubmitting(true);
    const notesParts = [];
    if (whatWorked.trim()) notesParts.push(`What worked: ${whatWorked.trim()}`);
    if (whatFailed.trim()) notesParts.push(`What failed: ${whatFailed.trim()}`);
    if (nextSteps.trim()) notesParts.push(`Next to test: ${nextSteps.trim()}`);
    await onComplete({
      conclusion: conclusion.trim(),
      notes: notesParts.join("\n\n"),
    });
    setSubmitting(false);
  };

  const handleClose = () => {
    setConclusion("");
    setWhatWorked("");
    setWhatFailed("");
    setNextSteps("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-sm">Session Reflection</h2>
              <p className="text-xs text-muted-foreground">{session?.name || "Complete your session"}</p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> Conclusion <span className="text-destructive">*</span>
            </label>
            <textarea
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="What did you learn from this session?"
              rows={3}
              autoFocus
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3" /> What worked? <span className="text-muted-foreground/50 font-normal">(optional)</span>
            </label>
            <textarea
              value={whatWorked}
              onChange={(e) => setWhatWorked(e.target.value)}
              placeholder="Which setups or patterns were profitable?"
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> What failed? <span className="text-muted-foreground/50 font-normal">(optional)</span>
            </label>
            <textarea
              value={whatFailed}
              onChange={(e) => setWhatFailed(e.target.value)}
              placeholder="What mistakes or losses occurred?"
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <Rocket className="w-3 h-3" /> What should be tested next? <span className="text-muted-foreground/50 font-normal">(optional)</span>
            </label>
            <textarea
              value={nextSteps}
              onChange={(e) => setNextSteps(e.target.value)}
              placeholder="What do you want to explore in the next session?"
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <button onClick={handleClose} className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!conclusion.trim() || submitting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-success text-white text-sm font-semibold hover:bg-success/90 transition-colors disabled:opacity-50"
          >
            {submitting ? "Completing…" : "Complete Session"}
          </button>
        </div>
      </div>
    </div>
  );
}