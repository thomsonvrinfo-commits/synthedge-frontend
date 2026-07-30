import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
// queryClientInstance is also used in the onboarding effect below to seed the
// shared ["currentProfile"] cache so pages don't re-fetch it on mount.
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ModeProvider } from '@/lib/ModeContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import React, { useState, useEffect, useRef } from 'react';
import { initUserTrial } from '@/api/auth';
import { getMyProfileAsList } from '@/api/profile';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/Dashboard';
import Journal from '@/pages/Journal';
import Backtest from '@/pages/Backtest';
import ReplayHub from '@/pages/ReplayHub';
import Assistant from '@/pages/Assistant';
import Settings from '@/pages/Settings';
import Upgrade from '@/pages/Upgrade';
import Onboarding from '@/pages/Onboarding';
import PaynowCheckout from '@/pages/PaynowCheckout';
import Performance from '@/pages/Performance';
import Pricing from '@/pages/Pricing';
import AppLayout from '@/components/layout/AppLayout';


const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, user, isAuthenticated } = useAuth();
  // isAuthenticated and user come from AuthContext — do NOT call the auth API independently
  const [onboardingDone, setOnboardingDone] = useState(null); // null=loading, true/false
  const trialInitFired = useRef(false);

  // Fires once per mount, the moment we learn this user has no TraderProfile
  // yet — i.e. a brand-new signup, whether via email/OTP or Google (both
  // funnel through this same onboarding check, so this is the one universal
  // hook point). Starts the 7-day trial on the User entity and fires
  // USER_CREATED + TRIAL_STARTED through the Cloudflare lifecycle worker to
  // Brevo. The backend function is idempotent (skips if already
  // initialized), and this call is intentionally fire-and-forget: a
  // lifecycle/Brevo hiccup must never block a new user from onboarding.
  useEffect(() => {
    if (onboardingDone !== false || trialInitFired.current) return;
    trialInitFired.current = true;
    initUserTrial().catch((err) => {
      console.error("initUserTrial failed:", err?.message || err);
    });
  }, [onboardingDone]);

  // Only check onboarding once auth is resolved and user is authenticated.
  // Never call the auth API here — AuthContext already owns that.
  useEffect(() => {
    if (isLoadingAuth) return;

    if (!isAuthenticated || !user) {
      setOnboardingDone(true);
      return;
    }

    // AuthContext already fired a fire-and-forget prefetch for the profile
    // the moment auth.me() resolved.  Check the cache synchronously first —
    // if the profile is already there (common on warm loads and increasingly
    // on cold loads since the prefetch overlaps with the rest of boot), we
    // can resolve onboarding instantly with zero blocking spinner.
    const cached = queryClientInstance.getQueryData(["currentProfile", user.id]);
    if (cached) {
      setOnboardingDone(!!cached[0]?.display_name);
      return;
    }

    // Cache miss — fetch (will hit if AuthContext's prefetch hasn't landed yet).
    // This still blocks briefly, but far less often now that the prefetch fires
    // earlier in the lifecycle.
    queryClientInstance
      .fetchQuery({
        queryKey: ["currentProfile", user.id],
        queryFn: getMyProfileAsList,
      })
      .then((profiles) => setOnboardingDone(!!profiles[0]?.display_name))
      .catch(() => setOnboardingDone(true));
  }, [isLoadingAuth, isAuthenticated, user?.id]);
  if (isLoadingPublicSettings || isLoadingAuth || onboardingDone === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
  if (authError.type === 'user_not_registered') {
    return <UserNotRegisteredError />;
  }

  console.warn("Auth error:", authError);
}

  if (onboardingDone === false) {
    return (
      <Onboarding onComplete={() => setOnboardingDone(true)} />
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/backtest" element={<ReplayHub />} />
          <Route path="/backtest/replay" element={<Backtest />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/checkout/paynow" element={<PaynowCheckout />} />
          <Route path="/performance" element={<Performance />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <ModeProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
        </ModeProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App
