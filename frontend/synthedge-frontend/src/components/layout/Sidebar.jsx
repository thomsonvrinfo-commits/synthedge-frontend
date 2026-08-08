import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BookOpen, PlayCircle, Brain, Sparkles,
  ChevronLeft, ChevronRight, LogOut,
  Settings, Crown, Plus, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn, getDisplayName } from "@/lib/utils";
import ThemeToggle from "@/components/ThemeToggle";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/journal", icon: BookOpen, label: "Journal" },
  { path: "/backtest", icon: PlayCircle, label: "Replay" },
  { path: "/coach", icon: Sparkles, label: "Coach" },
  { path: "/assistant", icon: Brain, label: "Intelligence" },
  { path: "/settings", icon: Settings, label: "Settings" },
  { path: "/performance", icon: BarChart3, label: "Performance" },
];

export default function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const { user, profile } = useCurrentUser();
  const { logout } = useAuth();

  const handleLogout = () => {
    // AuthContext.logout() already clears all cached queries (so the next
    // account doesn't see the previous user's trades/sessions/profile data)
    // and clears the auth token — no need to duplicate that here.
    logout();
  };

  const NavContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("p-4 flex items-center gap-3 border-b border-sidebar-border", collapsed ? "justify-center" : "")}>
        <img
          src="/synthedge-logo.png"
          alt="SynthEdge"
          className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
        />
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground tracking-tight leading-none">SynthEdge</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">Trade Less. Trade Better.</p>
          </div>
        )}
      </div>

      {/* Nav Links */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4", isActive ? "text-primary" : "")} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Log Trade CTA */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <Link to="/journal" onClick={() => setMobileOpen(false)}>
            <Button className="w-full gap-2 h-9 text-sm font-semibold" size="sm">
              <Plus className="w-4 h-4" />
              Log Trade
            </Button>
          </Link>
        </div>
      )}

      {/* Upgrade */}
      <div className="px-3 pb-1">
        <Link
          to="/pricing"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150",
            "text-warning hover:text-warning/90 hover:bg-warning/10"
          )}
        >
          <Crown className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
          {!collapsed && <span>Upgrade</span>}
        </Link>
      </div>

      {/* Bottom: user profile + theme + logout */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {!collapsed && user && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1">
            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-primary text-xs font-bold">
                {(profile?.display_name || getDisplayName(user)).charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">
                {profile?.display_name || getDisplayName(user, { firstNameOnly: false })}
              </p>
              <p className="text-[10px] text-muted-foreground">Elite Trader</p>
            </div>
          </div>
        )}
        <ThemeToggle className={cn("w-full text-xs", collapsed ? "justify-center px-2" : "justify-start")} />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent w-full transition-colors"
        >
          <LogOut className={cn("flex-shrink-0", collapsed ? "w-5 h-5" : "w-4 h-4")} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );

  // ── Mobile: bottom tab bar ────────────────────────────────────────────────
  // Hidden inside the chart/replay workspace — that screen has its own
  // playback bar, and stacking both bars eats vertical space candles need.
  const hideOnMobile = location.pathname.startsWith("/backtest/replay");

  if (isMobile && hideOnMobile) return null;

  if (isMobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border flex items-center justify-around px-1 pb-safe"
           style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 px-3 rounded-lg transition-all min-w-[52px] min-h-[52px]",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  // ── Desktop: sidebar ──────────────────────────────────────────────────────
  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0 relative",
        collapsed ? "w-[60px]" : "w-56"
      )}
    >
      <NavContent />
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute bottom-24 -right-3 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center hover:bg-accent transition-colors z-10"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  );
}