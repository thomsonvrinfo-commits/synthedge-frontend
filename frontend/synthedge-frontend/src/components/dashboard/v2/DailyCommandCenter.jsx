import React from "react";
import { Flame, BookOpen, CheckCircle2, Brain } from "lucide-react";
import { cn, getDisplayName } from "@/lib/utils";

function StreakCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 flex flex-col items-center justify-center gap-1 min-w-0">
      <Icon className={cn("w-5 h-5 mb-1", color)} />
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground font-medium tracking-wide uppercase">{label}</span>
    </div>
  );
}

function ProfileCard({ tradeCount }) {
  const pct = Math.min(100, Math.round((tradeCount / 50) * 100));
  const circumference = 2 * Math.PI * 18;
  const progress = (pct / 100) * circumference;

  return (
    <div className="bg-card rounded-2xl border border-border/60 shadow-sm p-4 flex flex-col items-center justify-center gap-1">
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90">
          <circle cx="20" cy="20" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
          <circle
            cx="20" cy="20" r="18" fill="none"
            stroke="hsl(var(--primary))" strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold">{pct}%</span>
      </div>
      <span className="text-[11px] text-muted-foreground font-medium text-center leading-tight">AI Profile</span>
    </div>
  );
}

export default function DailyCommandCenter({ user, profile, stats, tradeCount }) {
  console.log("USER", user);
console.log("PROFILE", profile);
const firstName =
  profile?.display_name?.split(" ")[0] ||
  getDisplayName(user);

  // Derive simple streak values from trade history (simplified)
  const disciplineStreak = Math.min(30, Math.round((stats.disciplineScore / 100) * 21));
  const journalStreak = Math.min(21, Math.round((stats.total / Math.max(stats.total, 1)) * 14));
  const checkinStreak = Math.max(0, disciplineStreak - 3);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
 <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
  Welcome back, {firstName} 👋
</h1>
  <p className="text-sm text-muted-foreground mt-1 font-medium">
    Discipline today. Freedom tomorrow.
  </p>
</div>
      <div className="grid grid-cols-4 gap-2 sm:flex sm:items-center sm:gap-2">
        <StreakCard icon={Flame}       label="Discipline" value={disciplineStreak} color="text-orange-500" />
        <StreakCard icon={BookOpen}    label="Journal"    value={journalStreak}   color="text-primary" />
        <StreakCard icon={CheckCircle2} label="Check-In"  value={checkinStreak}   color="text-emerald-500" />
        <ProfileCard tradeCount={tradeCount} />
      </div>
    </div>
  );
}