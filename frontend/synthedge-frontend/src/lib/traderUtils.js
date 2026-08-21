// Shared analytics computations used across the app
import { isMissingVolume } from "@/lib/symbolSpecs";

export function computeStats(trades) {
  if (!trades || !trades.length) return {
    total: 0, wins: 0, losses: 0, be: 0, winRate: 0, totalPL: 0,
    avgRR: 0, avgExecution: 0, disciplineScore: 0, bestSetup: null,
    worstSession: null, bestSession: null, missingVolumeCount: 0,
  };

  const wins = trades.filter(t => t.result === "Win").length;
  const losses = trades.filter(t => t.result === "Loss").length;
  const be = trades.filter(t => t.result === "Breakeven").length;

  // Exclude trades with no volume from P/L aggregates — never assume 1.0 lot
  const missingVolumeCount = trades.filter(isMissingVolume).length;
  const plTrades = trades.filter(t => !isMissingVolume(t) && (t.pl ?? t.profit_loss) != null);
  const totalPL = plTrades.reduce((s, t) => s + (t.pl ?? t.profit_loss ?? 0), 0);

  // Support both canonical (rr) and legacy (risk_reward_ratio) fields
  const rrTrades = trades.filter(t => (t.rr ?? t.risk_reward_ratio) != null);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + (t.rr ?? t.risk_reward_ratio), 0) / rrTrades.length : 0;

  const execTrades = trades.filter(t => t.execution_rating);
  const avgExecution = execTrades.length ? execTrades.reduce((s, t) => s + t.execution_rating, 0) / execTrades.length : 0;

  // Discipline score: penalize violations, emotion issues, low execution
  const violationCount = trades.reduce((s, t) => s + (t.rule_violations?.length || 0), 0);
  const badEmotions = trades.filter(t => ["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"].includes(t.emotional_state)).length;
  const disciplineScore = Math.max(0, Math.min(100,
    100
    - (violationCount / Math.max(trades.length, 1)) * 30
    - (badEmotions / Math.max(trades.length, 1)) * 25
    - (avgExecution < 5 ? (5 - avgExecution) * 3 : 0)
  ));

  // Per-setup stats — read canonical setup, fall back to legacy strategy
  const setupMap = {};
  trades.filter(t => t.setup || t.strategy).forEach(t => {
    const key = t.setup || t.strategy;
    if (!setupMap[key]) setupMap[key] = { wins: 0, total: 0, pl: 0, rrs: [] };
    setupMap[key].total++;
    if (t.result === "Win") setupMap[key].wins++;
    if (!isMissingVolume(t)) setupMap[key].pl += (t.pl ?? t.profit_loss ?? 0);
    const rrVal = t.rr ?? t.risk_reward_ratio;
    if (rrVal) setupMap[key].rrs.push(rrVal);
  });

  const setupEntries = Object.entries(setupMap).filter(([, s]) => s.total >= 2);
  const bestSetup = setupEntries.sort(([, a], [, b]) =>
    (b.wins / b.total) - (a.wins / a.total)
  )[0];

  // Per-session stats
  const sessionMap = {};
  trades.filter(t => t.session).forEach(t => {
    if (!sessionMap[t.session]) sessionMap[t.session] = { wins: 0, total: 0, pl: 0, rrs: [] };
    sessionMap[t.session].total++;
    if (t.result === "Win") sessionMap[t.session].wins++;
    if (!isMissingVolume(t)) sessionMap[t.session].pl += (t.pl ?? t.profit_loss ?? 0);
    const rrVal = t.rr ?? t.risk_reward_ratio;
    if (rrVal) sessionMap[t.session].rrs.push(rrVal);
  });

  const sessionEntries = Object.entries(sessionMap).filter(([, s]) => s.total >= 1);
  const bestSession = sessionEntries.sort(([, a], [, b]) => b.pl - a.pl)[0];
  const worstSession = sessionEntries.sort(([, a], [, b]) => a.pl - b.pl)[0];

  // Emotion breakdown
  const emotionMap = {};
  trades.filter(t => t.emotional_state).forEach(t => {
    if (!emotionMap[t.emotional_state]) emotionMap[t.emotional_state] = { wins: 0, total: 0 };
    emotionMap[t.emotional_state].total++;
    if (t.result === "Win") emotionMap[t.emotional_state].wins++;
  });

  return {
    total: trades.length, wins, losses, be,
    winRate: parseFloat(((wins / trades.length) * 100).toFixed(1)),
    totalPL: parseFloat(totalPL.toFixed(2)),
    missingVolumeCount,
    avgRR: parseFloat(avgRR.toFixed(2)),
    avgExecution: parseFloat(avgExecution.toFixed(1)),
    disciplineScore: parseFloat(disciplineScore.toFixed(0)),
    violationCount,
    badEmotionCount: badEmotions,
    bestSetup: bestSetup ? { name: bestSetup[0], ...bestSetup[1], winRate: parseFloat(((bestSetup[1].wins / bestSetup[1].total) * 100).toFixed(1)) } : null,
    setupMap,
    sessionMap,
    bestSession: bestSession ? { name: bestSession[0], ...bestSession[1] } : null,
    worstSession: worstSession ? { name: worstSession[0], ...worstSession[1] } : null,
    emotionMap,
  };
}

export function computeConsistencyScore(trades) {
  if (trades.length < 5) return 0;
  // Consistency = low variance in daily trade count + high rule compliance + stable emotions
  const dayMap = {};
  // Support canonical createdAt and legacy trade_date
  trades.filter(t => t.createdAt || t.trade_date).forEach(t => {
    const ts = t.createdAt || t.trade_date;
    const day = ts.slice(0, 10);
    dayMap[day] = (dayMap[day] || 0) + 1;
  });
  const dayCounts = Object.values(dayMap);
  const avgDay = dayCounts.reduce((s, v) => s + v, 0) / dayCounts.length;
  const variance = dayCounts.reduce((s, v) => s + Math.pow(v - avgDay, 2), 0) / dayCounts.length;
  const consistencyScore = Math.max(0, Math.min(100, 100 - variance * 10));
  return parseFloat(consistencyScore.toFixed(0));
}

export const GOAL_DEFINITIONS = {
  "Discipline": {
    icon: "🎯",
    focus: ["rule_violations", "emotional_state", "overtrading"],
    description: "Track rule adherence and trading discipline"
  },
  "Patience": {
    icon: "⏳",
    focus: ["early_entries", "impulsive_trades", "wait_for_confirmation"],
    description: "Reduce impulsive entries and improve timing"
  },
  "Emotional Control": {
    icon: "🧘",
    focus: ["emotional_state", "revenge_trades", "fomo_trades"],
    description: "Analyze and improve emotional states during trading"
  },
  "Risk Management": {
    icon: "🛡️",
    focus: ["rr_ratio", "lot_size", "risk_per_trade"],
    description: "Optimize risk-to-reward and position sizing"
  },
  "Better Entries": {
    icon: "📍",
    focus: ["execution_rating", "entry_accuracy", "confirmation"],
    description: "Improve entry timing and confirmation quality"
  },
  "Higher RR": {
    icon: "📈",
    focus: ["risk_reward_ratio", "tp_hits", "partial_exits"],
    description: "Maximize reward relative to risk taken"
  },
  "Session Discipline": {
    icon: "🕐",
    focus: ["session", "session_performance", "off_hours_trades"],
    description: "Trade only during optimal sessions"
  },
  "Consistency": {
    icon: "🔄",
    focus: ["daily_trades", "variance", "routine"],
    description: "Build a consistent and repeatable process"
  },
  "Avoiding Revenge Trading": {
    icon: "🚫",
    focus: ["revenge_state", "post_loss_trades", "cooling_off"],
    description: "Eliminate revenge trading patterns"
  },
};

export const ALL_GOALS = Object.keys(GOAL_DEFINITIONS);

export const DEFAULT_STRATEGIES = [
  "Break & Retest", "Liquidity Sweep", "AMD Setup", "Trend Continuation",
  "Session Breakout", "Reversal Entry", "Spike Entry", "Support Bounce",
  "Resistance Rejection", "Range Break", "ICT MSS", "BOS Entry",
];

export const DEFAULT_RULES = [
  { title: "Max 3 trades per day", category: "Risk Management" },
  { title: "No trading after 2 consecutive losses", category: "Psychology" },
  { title: "Minimum RR = 2", category: "Risk Management" },
  { title: "Only trade London or NY session", category: "Session Rules" },
  { title: "Wait for BOS confirmation", category: "Entry Rules" },
  { title: "Never move SL to increase risk", category: "Trade Management" },
  { title: "No trading during news events", category: "Risk Management" },
];

export const RESULT_COLORS = {
  Win: { bg: "bg-success/15", text: "text-success", border: "border-success/30" },
  Loss: { bg: "bg-destructive/15", text: "text-destructive", border: "border-destructive/30" },
  Breakeven: { bg: "bg-warning/15", text: "text-warning", border: "border-warning/30" },
};

export const EMOTION_COLORS = {
  Calm: "text-success",
  Confident: "text-primary",
  Neutral: "text-muted-foreground",
  Anxious: "text-warning",
  FOMO: "text-orange-400",
  Revenge: "text-destructive",
  Frustrated: "text-orange-500",
  Excited: "text-yellow-400",
  Fearful: "text-red-300",
  Overconfident: "text-pink-400",
};
