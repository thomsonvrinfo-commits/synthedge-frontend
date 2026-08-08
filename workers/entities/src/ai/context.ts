// AI Coach — context engine.
//
// Builds the minimum necessary context for a coaching request rather than
// dumping the user's whole history at the model: aggregate stats (computed
// here, not fetched pre-computed — there's nowhere else in the backend that
// already does this) plus a small, bounded sample of the most relevant raw
// records. Every query is scoped to `created_by_id = userId` — this is the
// one function every AI route depends on for data access, so getting the
// scoping right here is what "users can only access their own data" (Phase
// 8) actually rests on.
//
// The discipline-score formula intentionally matches
// frontend/src/lib/traderUtils.js's computeStats() exactly, so the coach's
// narrative never contradicts numbers the user sees elsewhere in the app.

import type { Env } from "@synthedge/shared";
import { d1All, d1First } from "@synthedge/shared";

export interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPL: number;
  avgRR: number;
  avgExecution: number;
  disciplineScore: number;
}

export interface SetupSummary {
  name: string;
  total: number;
  winRate: number;
  pl: number;
  avgRR: number | null;
}

export interface SessionSummary {
  name: string;
  total: number;
  winRate: number;
  pl: number;
}

export interface EmotionSummary {
  state: string;
  total: number;
  winRate: number;
}

export interface CompactTrade {
  symbol: string | null;
  direction: string;
  result: string;
  pl: number | null;
  setup: string | null;
  session: string | null;
  emotional_state: string | null;
  execution_rating: number | null;
  rule_violations: string[] | null;
  plan_followed: string | null;
  notes: string | null;
  trade_date: string | null;
}

export interface ActiveRule {
  title: string;
  category: string;
  violation_count: number;
}

export interface ReplaySummary {
  name: string | null;
  strategy_name: string | null;
  objective: string | null;
  conclusion: string | null;
  completed_at: string | null;
}

export interface BrokerSummary {
  broker: string;
  account_type: string;
  total: number;
  pnl: number;
}

export interface CoachContext {
  profile: { displayName: string | null; accountSize: number | null; riskPerTrade: number | null } | null;
  stats: TradeStats;
  bestSetup: SetupSummary | null;
  worstSetup: SetupSummary | null;
  bestSession: SessionSummary | null;
  worstSession: SessionSummary | null;
  emotionalPatterns: EmotionSummary[];
  recentTrades: CompactTrade[];
  activeRules: ActiveRule[];
  recentReplaySessions: ReplaySummary[];
  brokerSummary: BrokerSummary[];
}

const RECENT_TRADES_LIMIT = 15;
const STATS_WINDOW_LIMIT = 300; // trades considered for aggregate stats, not all sent to the model
const ACTIVE_RULES_LIMIT = 20;
const REPLAY_SESSIONS_LIMIT = 5;

const BAD_EMOTIONS = new Set(["FOMO", "Revenge", "Anxious", "Frustrated", "Fearful"]);

interface TradeRow {
  symbol: string | null;
  direction: string;
  result: "Win" | "Loss" | "Breakeven";
  pl: number | null;
  profit_loss: number | null;
  rr: number | null;
  risk_reward_ratio: number | null;
  execution_rating: number | null;
  setup: string | null;
  strategy: string | null;
  session: string | null;
  emotional_state: string | null;
  rule_violations: string | null;
  plan_followed: string | null;
  notes: string | null;
  trade_date: string | null;
  lot_size: number | null;
  stake: number | null;
  created_date: string;
}

function pl(t: TradeRow): number | null {
  return t.pl ?? t.profit_loss ?? null;
}
function rr(t: TradeRow): number | null {
  return t.rr ?? t.risk_reward_ratio ?? null;
}
function setupName(t: TradeRow): string | null {
  return t.setup ?? t.strategy ?? null;
}
function hasVolume(t: TradeRow): boolean {
  return t.lot_size != null || t.stake != null;
}

function computeStats(trades: TradeRow[]): TradeStats {
  const total = trades.length;
  const wins = trades.filter((t) => t.result === "Win").length;
  const losses = trades.filter((t) => t.result === "Loss").length;
  const breakeven = trades.filter((t) => t.result === "Breakeven").length;

  const plTrades = trades.filter((t) => hasVolume(t) && pl(t) != null);
  const totalPL = plTrades.reduce((s, t) => s + (pl(t) ?? 0), 0);

  const rrTrades = trades.filter((t) => rr(t) != null);
  const avgRR = rrTrades.length ? rrTrades.reduce((s, t) => s + (rr(t) ?? 0), 0) / rrTrades.length : 0;

  const execTrades = trades.filter((t) => t.execution_rating != null);
  const avgExecution = execTrades.length
    ? execTrades.reduce((s, t) => s + (t.execution_rating ?? 0), 0) / execTrades.length
    : 0;

  const violationCount = trades.reduce((s, t) => {
    try {
      const parsed = t.rule_violations ? (JSON.parse(t.rule_violations) as unknown[]) : [];
      return s + (Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      return s;
    }
  }, 0);
  const badEmotionCount = trades.filter((t) => t.emotional_state && BAD_EMOTIONS.has(t.emotional_state)).length;
  const disciplineScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        (violationCount / Math.max(total, 1)) * 30 -
        (badEmotionCount / Math.max(total, 1)) * 25 -
        (avgExecution < 5 ? (5 - avgExecution) * 3 : 0)
    )
  );

  return {
    total,
    wins,
    losses,
    breakeven,
    winRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
    totalPL: Math.round(totalPL * 100) / 100,
    avgRR: Math.round(avgRR * 100) / 100,
    avgExecution: Math.round(avgExecution * 10) / 10,
    disciplineScore: Math.round(disciplineScore),
  };
}

function groupBy<K extends string>(trades: TradeRow[], keyFn: (t: TradeRow) => K | null): Map<K, TradeRow[]> {
  const map = new Map<K, TradeRow[]>();
  for (const t of trades) {
    const key = keyFn(t);
    if (!key) continue;
    const group = map.get(key) ?? [];
    group.push(t);
    map.set(key, group);
  }
  return map;
}

function summarizeGroups(map: Map<string, TradeRow[]>, minTrades = 2): SetupSummary[] {
  const summaries: SetupSummary[] = [];
  for (const [name, group] of map) {
    if (group.length < minTrades) continue;
    const wins = group.filter((t) => t.result === "Win").length;
    const plGroup = group.filter((t) => hasVolume(t) && pl(t) != null);
    const rrGroup = group.filter((t) => rr(t) != null);
    summaries.push({
      name,
      total: group.length,
      winRate: Math.round((wins / group.length) * 1000) / 10,
      pl: Math.round(plGroup.reduce((s, t) => s + (pl(t) ?? 0), 0) * 100) / 100,
      avgRR: rrGroup.length
        ? Math.round((rrGroup.reduce((s, t) => s + (rr(t) ?? 0), 0) / rrGroup.length) * 100) / 100
        : null,
    });
  }
  return summaries.sort((a, b) => b.winRate - a.winRate);
}

export async function buildCoachContext(env: Env, userId: string): Promise<CoachContext> {
  const [profile, trades, rules, replaySessions, brokerRows] = await Promise.all([
    d1First<{ display_name: string | null; account_size: number | null; risk_per_trade: number | null }>(
      env.DB,
      `SELECT display_name, account_size, risk_per_trade FROM trader_profiles WHERE created_by_id = ?`,
      userId
    ),
    d1All<TradeRow>(
      env.DB,
      `SELECT symbol, direction, result, pl, profit_loss, rr, risk_reward_ratio, execution_rating, setup, strategy,
              session, emotional_state, rule_violations, plan_followed, notes, trade_date, lot_size, stake, created_date
       FROM trades WHERE created_by_id = ? ORDER BY created_date DESC LIMIT ?`,
      userId,
      STATS_WINDOW_LIMIT
    ),
    d1All<{ title: string; category: string; violation_count: number }>(
      env.DB,
      `SELECT title, category, violation_count FROM trading_rules WHERE created_by_id = ? AND is_active = 1 ORDER BY violation_count DESC LIMIT ?`,
      userId,
      ACTIVE_RULES_LIMIT
    ),
    d1All<{
      name: string | null;
      strategy_name: string | null;
      objective: string | null;
      conclusion: string | null;
      completed_at: string | null;
    }>(
      env.DB,
      `SELECT name, strategy_name, objective, conclusion, completed_at FROM replay_sessions
       WHERE created_by_id = ? AND status = 'completed' ORDER BY completed_at DESC LIMIT ?`,
      userId,
      REPLAY_SESSIONS_LIMIT
    ),
    d1All<{ broker: string; account_type: string; total: number; pnl: number }>(
      env.DB,
      `SELECT broker, account_type, COUNT(*) as total, COALESCE(SUM(pnl), 0) as pnl
       FROM broker_trades WHERE created_by_id = ? GROUP BY broker, account_type`,
      userId
    ),
  ]);

  const stats = computeStats(trades);

  const setupSummaries = summarizeGroups(groupBy(trades, (t) => setupName(t)));
  const sessionSummaries = summarizeGroups(groupBy(trades, (t) => t.session)).map((s) => ({
    name: s.name,
    total: s.total,
    winRate: s.winRate,
    pl: s.pl,
  }));

  const emotionMap = groupBy(trades, (t) => t.emotional_state);
  const emotionalPatterns: EmotionSummary[] = Array.from(emotionMap.entries())
    .filter(([, group]) => group.length >= 2)
    .map(([state, group]) => ({
      state,
      total: group.length,
      winRate: Math.round((group.filter((t) => t.result === "Win").length / group.length) * 1000) / 10,
    }))
    .sort((a, b) => b.total - a.total);

  const recentTrades: CompactTrade[] = trades.slice(0, RECENT_TRADES_LIMIT).map((t) => ({
    symbol: t.symbol,
    direction: t.direction,
    result: t.result,
    pl: pl(t),
    setup: setupName(t),
    session: t.session,
    emotional_state: t.emotional_state,
    execution_rating: t.execution_rating,
    rule_violations: (() => {
      try {
        return t.rule_violations ? (JSON.parse(t.rule_violations) as string[]) : null;
      } catch {
        return null;
      }
    })(),
    plan_followed: t.plan_followed,
    notes: t.notes ? t.notes.slice(0, 240) : null,
    trade_date: t.trade_date ?? t.created_date,
  }));

  return {
    profile: profile
      ? { displayName: profile.display_name, accountSize: profile.account_size, riskPerTrade: profile.risk_per_trade }
      : null,
    stats,
    bestSetup: setupSummaries[0] ?? null,
    worstSetup: setupSummaries.length > 1 ? setupSummaries[setupSummaries.length - 1]! : null,
    bestSession: sessionSummaries[0] ?? null,
    worstSession: sessionSummaries.length > 1 ? sessionSummaries[sessionSummaries.length - 1]! : null,
    emotionalPatterns,
    recentTrades,
    activeRules: rules,
    recentReplaySessions: replaySessions,
    brokerSummary: brokerRows,
  };
}
