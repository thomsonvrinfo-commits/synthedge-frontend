import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import TrialBanner from "@/components/subscription/TrialBanner";
import { useIsMobile } from "@/hooks/use-mobile";

// Pages that manage their own full-height layout (the canvas-based replay/
// chart screen only — NOT the ReplayHub session list at "/backtest", which
// is an ordinary scrollable page and must keep overflow-auto or its content
// (e.g. the New Session form) gets clipped with no way to scroll to it,
// especially on short mobile viewports).
const FULL_HEIGHT_ROUTES = ["/backtest/replay", "/coach"];

export default function AppLayout() {
  const location = useLocation();
  const isFullHeight = FULL_HEIGHT_ROUTES.includes(location.pathname);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div
        className="flex-1 flex flex-col overflow-hidden min-w-0"
        style={isMobile ? { paddingBottom: "56px" } : undefined}
      >
        <TrialBanner />
        {isFullHeight ? (
          <main className="flex-1 overflow-hidden min-w-0">
            <Outlet />
          </main>
        ) : (
          <main className="flex-1 overflow-auto">
            <div className="p-4 lg:p-6 pt-4 lg:pt-6">
              <Outlet />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}