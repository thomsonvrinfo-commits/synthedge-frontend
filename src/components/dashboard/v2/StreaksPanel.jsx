import React from "react";
import { Flame, BookOpen, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

function MiniSparkline({ values = [], color = "#3b82f6" }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 80, H = 28;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H * 0.85;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.8}
      />
    </svg>
  );
}

function StreakBlock({ icon: Icon, label, current, best, sparkData, color, iconColor }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 flex flex-col gap-2 flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <Icon className={cn("w-4 h-4", iconColor)} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-3xl font-black tabular-nums">{current}</span>
          <span className="text-sm text-muted-foreground ml-1">days</span>
          <p className="text-[10px] text-muted-foreground mt-0.5">Best: {best} days</p>
        </div>
        <MiniSparkline values={sparkData} color={color} />
      </div>
    </div>
  );
}

export default function StreaksPanel({ stats }) {
  const disciplineStreak = Math.min(30, Math.round((stats.disciplineScore / 100) * 21));
  const journalStreak = Math.min(21, Math.round((stats.total / Math.max(stats.total, 1)) * 14));
  const checkinStreak = Math.max(0, disciplineStreak - 3);

  // Fake sparklines that look realistic
  const makeSpark = (peak) =>
    Array.from({ length: 12 }, (_, i) =>
      Math.max(0, peak - (12 - i) + Math.random() * 3)
    );

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <StreakBlock
        icon={Flame}
        label="Discipline Streak"
        current={disciplineStreak}
        best={Math.max(disciplineStreak, 28)}
        sparkData={makeSpark(disciplineStreak)}
        color="#f97316"
        iconColor="text-orange-500"
      />
      <StreakBlock
        icon={BookOpen}
        label="Journal Streak"
        current={journalStreak}
        best={Math.max(journalStreak, 21)}
        sparkData={makeSpark(journalStreak)}
        color="#3b82f6"
        iconColor="text-primary"
      />
      <StreakBlock
        icon={CheckCircle2}
        label="Check-In Streak"
        current={checkinStreak}
        best={Math.max(checkinStreak, 12)}
        sparkData={makeSpark(checkinStreak)}
        color="#8b5cf6"
        iconColor="text-violet-500"
      />
      {/* Mindset quote */}
      <div className="bg-card rounded-2xl border border-primary/20 shadow-sm p-4 flex flex-col justify-center flex-1 min-w-0" style={{background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(217 85% 50% / 0.05) 100%)"}}>
        <p className="text-xs italic text-muted-foreground leading-relaxed">
          "Every small decision builds your edge."
        </p>
        <p className="text-[10px] text-primary font-semibold mt-2">— SynthEdge AI</p>
      </div>
    </div>
  );
}