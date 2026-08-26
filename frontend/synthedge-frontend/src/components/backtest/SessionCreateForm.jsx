import React, { useState } from "react";
import { Plus, X, FlaskConical } from "lucide-react";

const OBJECTIVE_SUGGESTIONS = [
  "V75 Demand Zone Validation",
  "BOS Mastery Week 1",
  "Liquidity Sweep Study",
  "Prop Firm Preparation",
];

export default function SessionCreateForm({
  onCreate,
  onCancel,
  creating,
  minVolume = 0.01,
  maxVolume = 1000,
  volumeStep = 0.01,
}) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [ruleInput, setRuleInput] = useState("");
  const [rules, setRules] = useState([]);
  const [notes, setNotes] = useState("");
  const [volume, setVolume] = useState(String(minVolume));

  const addRule = () => {
    const r = ruleInput.trim();
    if (r && !rules.includes(r)) setRules([...rules, r]);
    setRuleInput("");
  };

  const removeRule = (r) => setRules(rules.filter(x => x !== r));

  const handleCreate = () => {
    const parsedVolume = parseFloat(volume);

    if (!name.trim() || !objective.trim()) return;

    if (
      !Number.isFinite(parsedVolume) ||
      parsedVolume < minVolume ||
      parsedVolume > maxVolume
    ) {
      return;
    }

    onCreate({
      name: name.trim(),
      objective: objective.trim(),
      strategy_name: strategyName.trim(),
      rules_being_tested: rules.length ? rules : undefined,
      notes: notes.trim() || undefined,
      volume: parsedVolume,
    });
  };
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-5 space-y-4">
      {/* Session Name */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
          Session Name <span className="text-destructive">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. BOS Mastery Week 1"
          className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
      </div>

      {/* Objective */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
          Objective <span className="text-destructive">*</span>
        </label>
        <textarea
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="What are you testing or learning?"
          rows={2}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {OBJECTIVE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setObjective(s)}
              className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Strategy Name */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
          Strategy <span className="text-muted-foreground/50 font-normal">(optional)</span>
        </label>
        <input
          value={strategyName}
          onChange={(e) => setStrategyName(e.target.value)}
          placeholder="e.g. Supply & Demand"
          className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
        />
      </div>

      {/* Stake / Lot Size */}
<div>
  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
    Stake / Lot Size <span className="text-destructive">*</span>
  </label>

  <input
    type="number"
    min={minVolume}
    max={maxVolume}
    step={volumeStep}
    value={volume}
    onChange={(e) => setVolume(e.target.value)}
    placeholder={String(minVolume)}
    className="w-full h-10 bg-background border border-border rounded-lg px-3 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
  />

  <p className="text-[10px] text-muted-foreground mt-1">
    Min: {minVolume} · Max: {maxVolume}
  </p>
</div>
      
      {/* Rules Being Tested */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
          Rules Being Tested <span className="text-muted-foreground/50 font-normal">(optional)</span>
        </label>
        <div className="flex gap-2">
          <input
            value={ruleInput}
            onChange={(e) => setRuleInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }}
            placeholder="e.g. Trade with trend"
            className="flex-1 h-10 bg-background border border-border rounded-lg px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={addRule}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:text-foreground hover:bg-accent transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
        {rules.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {rules.map((r) => (
              <span key={r} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                {r}
                <button onClick={() => removeRule(r)} className="hover:text-destructive">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
          Notes <span className="text-muted-foreground/50 font-normal">(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Focus areas, constraints, context..."
          rows={2}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={!name.trim() || !objective.trim() || creating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <FlaskConical className="w-4 h-4" />
          {creating ? "Creating…" : "Create Session"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
