/**
 * analyticsEngine.js — Central Analytics Engine (SynthEdge Launch Commander V2.0)
 * All analytics formulas live here. Pages consume computeAnalytics(trades).
 * Never duplicate these formulas elsewhere.
 */
import { computeDisciplineScore, normalizeTrades } from "@/lib/tradeAdapter";

function round(value, digits = 2) {
  return Number.parseFloat((value || 0).toFixed(digits));
}

function groupStats(trades, key) {
  return trades.reduce((map, trade) => {
    const name = trade[key];
    if (!name) return map;
    if (!map[name]) map[name] = { wins: 0, losses: 0, total: 0, pl: 0, rr: 0, rrs: [] };
    map[name].total += 1;
    if (trade.result === "Win") map[name].wins += 1;
    if (trade.result === "Loss") map[name].losses += 1;
    map[name].pl += trade.pl ?? trade.profit_loss ?? trade.pnl ?? 0;
    if (trade.rr !== undefined) {
      map[name].rr += trade.rr;
      map[name].rrs.push(trade.rr);
    }
    return map;
  }, {});
}

function bestBy(entries, score) {
  return entries.length ? [...entries].sort(([, a], [, b]) => score(b) - score(a))[0] : null;
}

function worstBy(entries, score) {
  return entries.length ? [...entries].sort(([, a], [, b]) => score(a) - score(b))[0] : null;
}

export function computeEquityCurve(trades = []) {
  let cumulative = 0;
  const byDate = {};

  normalizeTrades(trades)
    .filter(t => t.createdAt)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .forEach(trade => {
      // Use local date parts to avoid UTC-shift moving trades to wrong calendar day
      const _d = new Date(trade.createdAt);
      const key = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
      const value = trade.pl ?? trade.profit_loss ?? trade.pnl ?? 0;
      if (!byDate[key]) byDate[key] = { date: key, dailyPL: 0, dailyRR: 0, count: 0 };
      byDate[key].dailyPL += trade.pl || 0;
      byDate[key].dailyRR += trade.rr || 0;
      byDate[key].count += 1;
      cumulative += value;
      byDate[key].equity = cumulative;
    });

  return Object.values(byDate).map(day => ({
    ...day,
    equity: round(day.equity),
    dailyPL: round(day.dailyPL),
    dailyRR: round(day.dailyRR),
  }));
}

export function computeCalendarDays(trades = []) {
  return normalizeTrades(trades).reduce((map, trade) => {
    if (!trade.createdAt) return map;
    const d = new Date(trade.createdAt);
    // Use local date parts to avoid UTC-shift moving trades to wrong calendar day
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!map[key]) map[key] = { count: 0, dailyRR: 0, dailyPL: 0 };
    map[key].count += 1;
    map[key].dailyRR += trade.rr || 0;
    map[key].dailyPL += trade.pl || 0;
    return map;
  }, {});
}

export function computeAnalytics(rawTrades = []) {
  const trades = normalizeTrades(rawTrades);
  const total = trades.length;
  if (!total) {
    return {
      total: 0, wins: 0, losses: 0, be: 0, winRate: 0, totalPL: 0, netRR: 0,
      avgRR: 0, profitFactor: 0, expectancy: 0, disciplineScore: 0, growthRate: 0,
      avgExecution: 0, bestSetup: null, worstSetup: null, bestSession: null, worstSession: null,
      setupMap: {}, sessionMap: {}, emotionMap: {}, equityCurve: [],
    };
  }

  const wins = trades.filter(t => t.result === "Win").length;
  const losses = trades.filter(t => t.result === "Loss").length;
  const be = trades.filter(t => t.result === "Breakeven").length;
  const totalPL = trades.reduce(
  (sum, trade) => sum + (trade.pl ?? trade.profit_loss ?? trade.pnl ?? 0),
  0
);
  const netRR = trades.reduce((sum, trade) => sum + (trade.rr || 0), 0);
  const rrTrades = trades.filter(t => t.rr !== undefined);
  const avgRR = rrTrades.length ? netRR / rrTrades.length : 0;
  const grossProfit = trades.filter(t => (t.pl || 0) > 0).reduce((sum, t) => sum + t.pl, 0);
  const grossLoss = Math.abs(trades.filter(t => (t.pl || 0) < 0).reduce((sum, t) => sum + t.pl, 0));
  const profitFactor = grossLoss > 0 ? round(grossProfit / grossLoss) : grossProfit > 0 ? Infinity : 0;

  // Correct expectancy: (winRate × avgWinR) − (lossRate × avgLossR)
  // Breakevens count toward total but not toward win/loss averages.
  const winTrades = trades.filter(t => t.result === "Win");
  const lossTrades = trades.filter(t => t.result === "Loss");
  const avgWinR =
winTrades.length
? winTrades.reduce((s,t)=>s+(t.rr ?? 0),0)/winTrades.length
:0;
  const avgLossR = lossTrades.length ? Math.abs(lossTrades.reduce((s, t) => s + (t.rr ?? (t.pl ?? 0)), 0) / lossTrades.length) : 0;
  const winRate = total > 0 ? wins / total : 0;
  const lossRate = total > 0 ? losses / total : 0;
  const expectancy = round(winRate * avgWinR - lossRate * avgLossR);
  const execTrades = trades.filter(t => t.execution_rating);
  const avgExecution = execTrades.length ? execTrades.reduce((s, t) => s + t.execution_rating, 0) / execTrades.length : 0;

  const setupMap = groupStats(trades, "setup");
  const sessionMap = groupStats(trades, "session");
  const setupEntries = Object.entries(setupMap).filter(([, s]) => s.total >= 1);
  const sessionEntries = Object.entries(sessionMap).filter(([, s]) => s.total >= 1);
  const setupScore = item => item.pl || item.rr || (item.wins / Math.max(item.total, 1));
  const bestSetup = bestBy(setupEntries, setupScore);
  const worstSetup = worstBy(setupEntries, setupScore);
  const bestSession = bestBy(sessionEntries, s => s.pl || s.rr);
  const worstSession = worstBy(sessionEntries, s => s.pl || s.rr);
  const equityCurve = computeEquityCurve(trades);
  const growthRate = equityCurve.length > 1
    ? ((equityCurve[equityCurve.length - 1].equity - equityCurve[0].equity) / Math.max(Math.abs(equityCurve[0].equity), 1)) * 100
    : 0;
  const emotionMap = groupStats(trades, "emotional_state");

  return {
    total, wins, losses, be,
    winRate: round((wins / total) * 100, 1),
    totalPL: round(totalPL),
    netRR: round(netRR),
    avgRR: round(avgRR),
    profitFactor: round(profitFactor),
    expectancy: round(expectancy),
    avgExecution: round(avgExecution, 1),
    disciplineScore: computeDisciplineScore(trades),
    growthRate: round(growthRate, 1),
    bestSetup: bestSetup ? { name: bestSetup[0], ...bestSetup[1], winRate: round((bestSetup[1].wins / bestSetup[1].total) * 100, 1) } : null,
    worstSetup: worstSetup ? { name: worstSetup[0], ...worstSetup[1], winRate: round((worstSetup[1].wins / worstSetup[1].total) * 100, 1) } : null,
    bestSession: bestSession ? { name: bestSession[0], ...bestSession[1] } : null,
    worstSession: worstSession ? { name: worstSession[0], ...worstSession[1] } : null,
    setupMap,
    sessionMap,
    emotionMap,
    equityCurve,
  };
}
