import React, { createContext, useState, useContext, useEffect } from 'react';
import * as authApi from '@/api/auth';
import { getMyProfileAsList } from '@/api/profile';
import { listTrades } from '@/api/trades';
import { listTradingRules } from '@/api/tradingRules';
import { listReplaySessions } from '@/api/replaySessions';
import { onUnauthorized } from '@/api/client';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  // The old platform's "app public settings" was a multi-tenant hosting-
  // platform concept (per-app config fetched from that platform's own proxy) that has no equivalent on
  // the new single-tenant Cloudflare backend, so there's no separate network
  // call for it anymore. The field is kept (always resolved together with
  // isLoadingAuth) purely so App.jsx's existing
  // `isLoadingPublicSettings || isLoadingAuth` check keeps working unchanged.
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    if (PUBLIC_ROUTES.includes(window.location.pathname)) {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
      return;
    }
    checkAppState();

    // If a token expires mid-session (e.g. a background refetch gets a 401),
    // drop back to a signed-out state instead of leaving stale user data around.
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setIsAuthenticated(false);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAppState = async () => {
    if (PUBLIC_ROUTES.includes(window.location.pathname)) {
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }

    try {
      setIsLoadingPublicSettings(true);
      setIsLoadingAuth(true);
      setAuthError(null);

      const currentUser = await authApi.me();

      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);

      if (currentUser) {
        queryClientInstance.setQueryData(["currentUser"], currentUser);
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);

        // Prefetch the user's FULL workspace immediately — fire-and-forget,
        // in parallel. This is what makes Journal/Dashboard/Assistant feel
        // instant on first visit: by the time the user clicks into any of
        // them, the data is already sitting in queryClientInstance's cache.
        // Every key + queryFn below is copy-pasted EXACTLY from the page
        // that owns it (Journal.jsx, Dashboard.jsx) — if you ever change
        // a query there, mirror the change here or the cache won't match
        // and the page will silently refetch instead of hitting cache.
        const uid = currentUser.id;
        Promise.allSettled([
          queryClientInstance.prefetchQuery({
            queryKey: ["currentProfile", uid],
            queryFn: getMyProfileAsList,
          }),
          queryClientInstance.prefetchQuery({
            queryKey: ["trades", uid],
            queryFn: () => listTrades({ limit: 500 }),
          }),
          queryClientInstance.prefetchQuery({
            queryKey: ["tradingRules", uid],
            queryFn: () => listTradingRules({ limit: 50 }),
          }),
          queryClientInstance.prefetchQuery({
            queryKey: ["replaySessions", uid],
            queryFn: () => listReplaySessions({ limit: 50 }),
          }),
        ]).catch(() => {});
      } else {
        setIsAuthenticated(false);
      }
      setAuthChecked(true);
      setIsLoadingAuth(false);
    } catch (error) {
      console.error('Unexpected error:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);

      const currentUser = await authApi.me();

      // Seed the shared ["currentUser"] React Query cache so useCurrentUser /
      // useSubscription don't fire a SECOND /auth/me round-trip on page mount.
      queryClientInstance.setQueryData(["currentUser"], currentUser);

      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsAuthenticated(false);
      setAuthChecked(true);
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);

    // Clear all cached queries so the next account doesn't see the previous
    // user's trades, sessions, or profile data.
    queryClientInstance.clear();

    authApi.logout().finally(() => {
      window.location.href = "/login";
    });
  };

  const navigateToLogin = () => {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
