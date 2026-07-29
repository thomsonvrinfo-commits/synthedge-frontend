import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Shield, Edit3, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const DEFAULT_DRIVERS = [
  { key: "focus", label: "Focus", emoji: "🎯", weight: 20, invert: false },
  { key: "confidence", label: "Confidence", emoji: "💪", weight: 15, invert: false },
  { key: "sleep", label: "Sleep Quality", emoji: "🌙", weight: 25, invert: false },
  { key: "stress", label: "Stress Level", emoji: "⚡", weight: 20, invert: true },
  { key: "prep", label: "Trading Preparation", emoji: "📋", weight: 20, invert: false },
];

const RISK_FLAGS = [
  "FOMO", "Revenge Trading", "Overtrading", "Fear of Pulling Trigger",
  "Moving Stop Loss", "Breaking Rules", "Emotional Trading", "Taking Low Quality Setups"
];

const STORAGE_PREFIX = "synthedge_readiness_v2";

function getStatusConfig(score) {
  if (score >= 90) return { label: "ELITE STATE", color: "#22c55e", bg: "bg-emerald-500/10 border-emerald-500/30", textColor: "text-emerald-500" };
  if (score >= 75) return { label: "READY TO TRADE", color: "#22c55e", bg: "bg-emerald-500/10 border-emerald-500/30", textColor: "text-emerald-500" };
  if (score >= 60) return { label: "CAUTION", color: "#f59e0b", bg: "bg-amber-500/10 border-amber-500/30", textColor: "text-amber-500" };
  return { label: "PROTECT CAPITAL", color: "#ef4444", bg: "bg-destructive/10 border-destructive/30", textColor: "text-destructive" };
}

function getAIRecommendation(scores, risks, drivers) {
  const stressDriver = drivers.find(d => d.key === "stress");
  const sleepDriver = drivers.find(d => d.key === "sleep");
  const stressScore = scores["stress"] || 5;
  const sleepScore = scores["sleep"] || 5;
  const overallScore = computeScore(scores, drivers, risks);

  if (risks.includes("Revenge Trading")) return "Revenge trading detected. Take a 30-minute break before placing any trades today.";
  if (risks.includes("FOMO")) return "FOMO risk is high. Only trade pre-planned setups. Skip any impulsive entries.";
  if (sleepScore < 5) return "Sleep quality is low. Consider reducing your risk by 50% today.";
  if (stressScore > 7) return "Stress level is elevated. Focus on discipline and avoid overtrading today.";
  if (overallScore >= 80) return "You are in a good state to execute your plan today. Focus on A+ setups and manage risk consistently.";
  return "Trade selectively today. Stick to your highest-probability setups and size down if uncertain.";
}

function computeScore(scores, drivers, risks) {
  let total = 0, totalWeight = 0;
  drivers.forEach(d => {
    const v = scores[d.key] || 5;
    const normalized = d.invert ? (10 - v) / 9 * 100 : (v / 10) * 100;
    total += normalized * d.weight;
    totalWeight += d.weight;
  });
  const base = totalWeight > 0 ? Math.round(total / totalWeight) : 70;
  const riskPenalty = risks.length * 5;
  return Math.max(0, Math.min(100, base - riskPenalty));
}

function ScoreRing({ score }) {
  const r = 52, circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const cfg = getStatusConfig(score);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: 130, height: 130 }}>
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={cfg.color} strokeWidth="8"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black tabular-nums" style={{ color: cfg.color }}>{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className={cn("text-xs font-bold px-2 py-1 rounded-full border", cfg.bg, cfg.textColor)}>
        ✓ {cfg.label}
      </span>
    </div>
  );
}

export default function TradingReadiness() {
  const { user } = useCurrentUser();
  const storageKey = `${STORAGE_PREFIX}_${user?.id || "anon"}`;
  const [checked, setChecked] = useState(false);
  const [scores, setScores] = useState({ focus: 7, confidence: 7, sleep: 7, stress: 3, prep: 8 });
  const [selectedRisks, setSelectedRisks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDrivers, setShowDrivers] = useState(false);
  const [drivers] = useState(DEFAULT_DRIVERS);
  const [completedAt, setCompletedAt] = useState(null);
  const [savedData, setSavedData] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        const now = Date.now();
        // Expire after 8 hours
        if (data.completedAt && now - data.completedAt < 8 * 60 * 60 * 1000) {
          setSavedData(data);
          setChecked(true);
          setCompletedAt(new Date(data.completedAt));
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {}
  }, [storageKey]);

  const totalScore = computeScore(scores, drivers, selectedRisks);
  const cfg = getStatusConfig(totalScore);

  const handleComplete = () => {
    const data = { scores, risks: selectedRisks, score: totalScore, completedAt: Date.now() };
    localStorage.setItem(storageKey, JSON.stringify(data));
    setSavedData(data);
    setCompletedAt(new Date());
    setChecked(true);
    setShowModal(false);
  };

  const handleReset = () => {
    localStorage.removeItem(storageKey);
    setChecked(false);
    setSavedData(null);
    setCompletedAt(null);
    setScores({ focus: 7, confidence: 7, sleep: 7, stress: 3, prep: 8 });
    setSelectedRisks([]);
  };

  const toggleRisk = (r) => setSelectedRisks(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);

  // Compact post-check card
  if (checked && savedData) {
    const d = savedData;
    const c = getStatusConfig(d.score);
    const topDriver = drivers.filter(dr => !dr.invert).reduce((best, dr) =>
      (d.scores[dr.key] || 0) > (d.scores[best?.key] || 0) ? dr : best, drivers[0]);
    const topRisk = d.risks[0];
    const validUntil = completedAt ? new Date(completedAt.getTime() + 8 * 60 * 60 * 1000) : null;
    const ai = getAIRecommendation(d.scores, d.risks, drivers);

    return (
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Trading Readiness</h3>
          </div>
          <button onClick={handleReset} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Re-check
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="text-3xl font-black" style={{ color: c.color }}>{d.score}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
          <div className="flex-1">
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", c.bg, c.textColor)}>✓ {c.label}</span>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{ai}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-emerald-500/8 border border-emerald-500/20">
            <p className="text-[10px] text-muted-foreground">Top Positive</p>
            <p className="text-xs font-bold text-emerald-600">{topDriver?.label || "—"}</p>
          </div>
          <div className="p-2 rounded-lg bg-destructive/8 border border-destructive/20">
            <p className="text-[10px] text-muted-foreground">Top Risk</p>
            <p className="text-xs font-bold text-destructive">{topRisk || "None"}</p>
          </div>
        </div>
        {validUntil && (
          <p className="text-[10px] text-muted-foreground text-center">
            Valid until {validUntil.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    );
  }

  // Pre-check card
  if (!showModal) {
    return (
      <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-5 flex flex-col gap-4 h-full"
        style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.04) 100%)" }}>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Trading Readiness</h3>
        </div>
        <p className="text-xs text-muted-foreground">Are you ready to trade live today?</p>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-sm text-center font-medium">Complete your daily check-in</p>
          <p className="text-xs text-muted-foreground text-center max-w-[200px]">Assess your mental state, physical readiness, and trading preparation.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Start Readiness Check
        </button>
      </div>
    );
  }

  // Modal form
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-5 flex flex-col gap-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Trading Readiness</h3>
        </div>
        <ScoreRing score={totalScore} />
      </div>

      {/* AI Recommendation preview */}
      <div className="p-2.5 rounded-xl bg-primary/8 border border-primary/20">
        <p className="text-[10px] font-semibold text-primary mb-1">✦ AI Recommendation</p>
        <p className="text-[11px] text-foreground leading-relaxed">{getAIRecommendation(scores, drivers, selectedRisks)}</p>
      </div>

      {/* Readiness Drivers */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Readiness Drivers</p>
          <button onClick={() => setShowDrivers(p => !p)} className="flex items-center gap-1 text-[10px] text-primary">
            <Edit3 className="w-3 h-3" /> Edit Drivers
          </button>
        </div>
        <div className="space-y-2">
          {drivers.map(d => (
            <div key={d.key} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                <span className="text-sm">{d.emoji}</span>
                <span className="text-xs text-muted-foreground truncate">{d.label}</span>
              </div>
              <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${(scores[d.key] || 5) / 10 * 100}%` }} />
              </div>
              <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{scores[d.key]}/10</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5,6,7,8,9,10].map(v => (
                  <button key={v} onClick={() => setScores(s => ({ ...s, [d.key]: v }))}
                    className={cn("w-2 h-2 rounded-full transition-all flex-shrink-0",
                      v <= (scores[d.key] || 5) ? "bg-primary" : "bg-secondary hover:bg-secondary/80"
                    )} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Flags */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What is your biggest risk today?</p>
        <div className="flex flex-wrap gap-1.5">
          {RISK_FLAGS.map(r => (
            <button key={r} onClick={() => toggleRisk(r)}
              className={cn("text-[10px] px-2 py-1 rounded-lg border transition-all",
                selectedRisks.includes(r)
                  ? "bg-destructive/15 border-destructive/40 text-destructive font-medium"
                  : "bg-secondary/30 border-border/40 text-muted-foreground hover:border-border"
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleComplete}
        className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors mt-auto">
        ✓ Update Readiness Check-In
      </button>
      <p className="text-[10px] text-muted-foreground text-center">Your check-in is private and helps improve your performance insights.</p>
    </div>
  );
}