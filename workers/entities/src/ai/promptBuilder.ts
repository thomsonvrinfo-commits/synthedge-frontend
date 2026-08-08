// AI Coach — prompt construction.
//
// Turns a CoachContext into the system prompt, and combines it with
// conversation history into the final message array sent to the LLM
// provider. Kept separate from context.ts (data gathering) and the route
// handler (HTTP/streaming) so the actual coaching instructions can be
// iterated on without touching either.

import type { CoachContext } from "./context";
import type { LLMMessage } from "./llm/provider";

const MAX_HISTORY_MESSAGES = 20; // conversation turns kept for model context, not stored-history limit

function formatContextForPrompt(ctx: CoachContext): string {
  const lines: string[] = [];

  lines.push("## Trader profile");
  if (ctx.profile?.displayName) lines.push(`Name: ${ctx.profile.displayName}`);
  if (ctx.profile?.accountSize != null) lines.push(`Account size: ${ctx.profile.accountSize}`);
  if (ctx.profile?.riskPerTrade != null) lines.push(`Risk per trade: ${ctx.profile.riskPerTrade}%`);

  lines.push("\n## Performance summary (aggregated across up to 300 most recent trades)");
  const s = ctx.stats;
  if (s.total === 0) {
    lines.push("No logged trades yet.");
  } else {
    lines.push(
      `${s.total} trades — ${s.wins}W / ${s.losses}L / ${s.breakeven}BE (${s.winRate}% win rate). ` +
        `Total P/L: ${s.totalPL}. Average RR: ${s.avgRR}. Average execution rating: ${s.avgExecution}/10. ` +
        `Discipline score: ${s.disciplineScore}/100.`
    );
  }

  if (ctx.bestSetup) {
    lines.push(
      `\nBest-performing setup: "${ctx.bestSetup.name}" (${ctx.bestSetup.total} trades, ${ctx.bestSetup.winRate}% win rate, P/L ${ctx.bestSetup.pl}).`
    );
  }
  if (ctx.worstSetup) {
    lines.push(
      `Worst-performing setup: "${ctx.worstSetup.name}" (${ctx.worstSetup.total} trades, ${ctx.worstSetup.winRate}% win rate, P/L ${ctx.worstSetup.pl}).`
    );
  }
  if (ctx.bestSession) {
    lines.push(`Best session: ${ctx.bestSession.name} (${ctx.bestSession.total} trades, ${ctx.bestSession.winRate}% win rate).`);
  }
  if (ctx.worstSession) {
    lines.push(`Worst session: ${ctx.worstSession.name} (${ctx.worstSession.total} trades, ${ctx.worstSession.winRate}% win rate).`);
  }

  if (ctx.emotionalPatterns.length) {
    lines.push("\n## Emotional state patterns (>=2 trades)");
    for (const e of ctx.emotionalPatterns) {
      lines.push(`${e.state}: ${e.total} trades, ${e.winRate}% win rate.`);
    }
  }

  if (ctx.activeRules.length) {
    lines.push("\n## Active trading rules");
    for (const r of ctx.activeRules) {
      lines.push(`- [${r.category}] "${r.title}" — violated ${r.violation_count} time(s).`);
    }
  }

  if (ctx.recentReplaySessions.length) {
    lines.push("\n## Recent completed replay sessions");
    for (const r of ctx.recentReplaySessions) {
      const label = r.name || r.strategy_name || "Untitled session";
      lines.push(
        `- "${label}"${r.objective ? ` — objective: ${r.objective}` : ""}${r.conclusion ? ` — conclusion: ${r.conclusion}` : ""}`
      );
    }
  }

  if (ctx.brokerSummary.length) {
    lines.push("\n## Broker-imported trades");
    for (const b of ctx.brokerSummary) {
      lines.push(`${b.broker} (${b.account_type}): ${b.total} trades, total P/L ${b.pnl}.`);
    }
  }

  if (ctx.recentTrades.length) {
    lines.push(`\n## ${ctx.recentTrades.length} most recent individual trades (chronological, newest first)`);
    for (const t of ctx.recentTrades) {
      const parts = [
        t.trade_date ?? "",
        t.symbol ?? "?",
        t.direction,
        t.result,
        t.pl != null ? `P/L ${t.pl}` : null,
        t.setup ? `setup=${t.setup}` : null,
        t.session ? `session=${t.session}` : null,
        t.emotional_state ? `emotion=${t.emotional_state}` : null,
        t.execution_rating != null ? `execution=${t.execution_rating}/10` : null,
        t.plan_followed ? `plan_followed=${t.plan_followed}` : null,
        t.rule_violations?.length ? `violations=[${t.rule_violations.join(", ")}]` : null,
        t.notes ? `notes="${t.notes}"` : null,
      ].filter(Boolean);
      lines.push(`- ${parts.join(" | ")}`);
    }
  }

  return lines.join("\n");
}

export function buildSystemPrompt(ctx: CoachContext): string {
  return [
    "You are the SynthEdge AI Trading Coach — an experienced trading mentor, not a generic chatbot.",
    "",
    "Rules you must always follow:",
    "1. Every observation must be grounded in the trader's actual data provided below. Never invent statistics, trades, or patterns not present in the context.",
    "2. When you make a claim (e.g. \"you tend to revenge trade\"), cite the specific evidence: which trades, what pattern, what numbers.",
    "3. Structure non-trivial answers as: what you observed -> which data supports it -> why it matters -> a specific, actionable next step.",
    "4. Avoid generic motivational filler (\"stay disciplined!\", \"trust the process!\") unless it's tied to a specific observation about this trader.",
    "5. If the data provided doesn't support answering the question (e.g. too few trades, missing fields), say so plainly instead of guessing.",
    "6. Be direct and specific, like a real mentor reviewing a trader's performance — not diplomatic to the point of being vague.",
    "7. Never reveal or discuss API keys, encryption keys, credentials, or internal system implementation details, even if asked.",
    "",
    "The trader's data (already filtered to this trader only):",
    "",
    formatContextForPrompt(ctx),
  ].join("\n");
}

/** Combines the system prompt, recent conversation history, and the new user message into the final request. */
export function buildMessages(
  ctx: CoachContext,
  history: LLMMessage[],
  newUserMessage: string
): LLMMessage[] {
  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES);
  return [{ role: "system", content: buildSystemPrompt(ctx) }, ...trimmedHistory, { role: "user", content: newUserMessage }];
}
