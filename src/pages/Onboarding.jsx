import React, { useState } from "react";
import { me as getCurrentUser } from "@/api/auth";
import { getMyProfileAsList, createProfile, updateProfile } from "@/api/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronRight, TrendingUp, Check } from "lucide-react";
import { queryClientInstance } from "@/lib/query-client";

const FOCUS_OPTIONS = [
  { id: "Discipline", icon: "🎯", description: "Stick to your rules every session" },
  { id: "Patience", icon: "⏳", description: "Wait for high-probability setups" },
  { id: "Emotional Control", icon: "🧘", description: "Trade calm, not reactive" },
  { id: "Risk Management", icon: "🛡️", description: "Protect capital above all else" },
  { id: "Better Entries", icon: "📍", description: "Improve entry timing and accuracy" },
  { id: "Consistency", icon: "🔄", description: "Build a repeatable process" },
];

const MINDSET_QUOTE = "The market rewards patience and punishes impulsiveness. Your edge is not a setup — it's your process.";

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [goals, setGoals] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleGoal = (id) => {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const handleFinish = async () => {
    setSaving(true);
    const me = queryClientInstance.getQueryData(["currentUser"]) || (await getCurrentUser());
    const existing = me ? await getMyProfileAsList() : [];
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 7);
    const data = {
      display_name: name.trim(),
      goals,
      subscription_plan: "trial",
      trial_end_date: trialEndDate.toISOString(),
    };
    if (existing[0]) {
      // Only set trial fields if they haven't been set before
      const updateData = { display_name: data.display_name, goals: data.goals };
      if (!existing[0].subscription_plan) {
        updateData.subscription_plan = "trial";
        updateData.trial_end_date = data.trial_end_date;
      }
      await updateProfile(updateData);
    } else {
      await createProfile(data);
    }
    setSaving(false);
    onComplete({ name: name.trim(), goals });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">SynthEdge</h1>
            <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Trader Development Platform</p>
          </div>
        </div>

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <div>
              <h2 className="text-2xl font-bold">What should we call you?</h2>
              <p className="text-sm text-muted-foreground mt-2">This is how SynthEdge will address you throughout the platform.</p>
            </div>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && name.trim() && setStep(2)}
              placeholder="Your trading name or first name…"
              className="bg-card border-border text-base h-12"
              autoFocus
            />
            <Button
              className="w-full h-11 text-base gap-2"
              disabled={!name.trim()}
              onClick={() => setStep(2)}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Step 2 — Focus Areas */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">What are you improving?</h2>
              <p className="text-sm text-muted-foreground mt-2">Select your current focus areas. SynthEdge will tailor your experience around these.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {FOCUS_OPTIONS.map(opt => {
                const active = goals.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleGoal(opt.id)}
                    className={cn(
                      "relative flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:border-border/80 hover:bg-accent/30"
                    )}
                  >
                    {active && (
                      <span className="absolute top-2.5 right-2.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </span>
                    )}
                    <span className="text-xl flex-shrink-0 mt-0.5">{opt.icon}</span>
                    <div>
                      <p className={cn("text-xs font-semibold", active ? "text-primary" : "text-foreground")}>{opt.id}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              className="w-full h-11 text-base gap-2"
              disabled={goals.length === 0 || saving}
              onClick={() => setStep(3)}
            >
              Continue <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Step 3 — Welcome */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="space-y-3">
              <div className="text-5xl mb-2">👋</div>
              <h2 className="text-3xl font-bold">Welcome to SynthEdge, {name}.</h2>
              <p className="text-muted-foreground text-sm">Your trader development environment is ready.</p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 text-left space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Focus</p>
              <div className="flex flex-wrap gap-2">
                {goals.map(g => (
                  <span key={g} className="px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-full text-xs font-semibold text-primary">{g}</span>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 text-left">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Mindset</p>
              <p className="text-sm text-foreground leading-relaxed italic">"{MINDSET_QUOTE}"</p>
            </div>

            <Button
              className="w-full h-11 text-base gap-2"
              onClick={handleFinish}
              disabled={saving}
            >
              {saving ? "Setting up…" : "Enter SynthEdge →"}
            </Button>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex justify-center gap-2 mt-8">
          {[1, 2, 3].map(s => (
            <div key={s} className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              s === step ? "w-6 bg-primary" : s < step ? "w-3 bg-primary/50" : "w-3 bg-border"
            )} />
          ))}
        </div>
      </div>
    </div>
  );
}