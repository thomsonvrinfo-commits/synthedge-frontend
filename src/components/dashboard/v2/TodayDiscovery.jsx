import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const INSIGHTS = [
  {
    highlight: "34%",
    text: "higher win rate during London Session.",
    improvement: "+$430",
    tips: ["Wait for BOS confirmation", "Risk below 1% per trade", "Your best setups are BOS Entries"],
  },
  {
    highlight: "2.1x",
    text: "better RR when confidence is above 7/10.",
    improvement: "+$280",
    tips: ["Only trade when confidence ≥ 7", "Journaling correlates with wins", "Skip trades when stressed"],
  },
  {
    highlight: "61%",
    text: "of losses happen after 2 consecutive wins.",
    improvement: "+$190",
    tips: ["Take a break after 2 wins", "Review rules after a win streak", "Reduce size on 3rd trade"],
  },
];

export default function TodayDiscovery({ stats }) {
  // Pick an insight based on available data
  const idx = stats.total % INSIGHTS.length;
  const insight = INSIGHTS[idx];

  return (
    <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-5 flex flex-col gap-3 h-full" style={{background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.04) 100%)"}}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Today's Discovery</h3>
          <span className="text-[10px] px-2 py-0.5 bg-primary text-primary-foreground rounded-full font-semibold">AI</span>
        </div>
        <Sparkles className="w-4 h-4 text-primary" />
      </div>

      <div className="flex-1">
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your win rate increases by{" "}
          <span className="text-4xl font-black text-foreground leading-none">{insight.highlight}</span>
          {" "}{insight.text}
        </p>
      </div>

      <div className="space-y-1.5">
        {insight.tips.map((tip, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-4 h-4 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-[10px]">✓</span>
            </div>
            {tip}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <div>
          <p className="text-[10px] text-muted-foreground">Potential monthly improvement</p>
          <p className="text-sm font-bold text-emerald-600">{insight.improvement} monthly</p>
        </div>
        <Link to="/assistant" className="flex items-center gap-1 text-xs text-primary font-medium hover:underline">
          View All Insights <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}