import React, {
  createContext,
  useState,
  useContext,
  useEffect,
} from "react";

import * as authApi from "@/api/auth";

import { getMyProfileAsList } from "@/api/profile";
import { listTrades } from "@/api/trades";
import { listTradingRules } from "@/api/tradingRules";
import { listReplaySessions } from "@/api/replaySessions";

import {
  onUnauthorized,
  setAuthToken,
  restoreAuthSession,
} from "@/api/client";

import { queryClientInstance } from "@/lib/query-client";

const AuthContext = createContext();

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] =
    useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  // ============================================================
  // GOOGLE OAUTH CALLBACK TOKEN HANDLER
  // Receives:
  // https://synthedgeapp.co.zw/#access_token=JWT
  // ============================================================

  useEffect(() => {
    const hashParams = new URLSearchParams(
      window.location.hash.substring(1)
    );

    const accessToken = hashParams.get("access_token");

    if (accessToken) {
      console.log("GOOGLE CALLBACK TOKEN FOUND");

      setAuthToken(accessToken);

      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search
      );
    }
  }, []);

  // ============================================================
  // INITIAL AUTH CHECK
  // ============================================================

  useEffect(() => {
    if (PUBLIC_ROUTES.includes(window.location.pathname)) {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
      return;
    }

    let cancelled = false;

    const initializeAuth = async () => {
      try {
        setIsLoadingAuth(true);
        setIsLoadingPublicSettings(true);
        setAuthError(null);

        /*
         * IMPORTANT:
         *
         * Restore the session BEFORE calling /auth/me.
         *
         * The access token is intentionally short-lived. If the stored
         * access token has expired, restoreAuthSession() uses the existing
         * HttpOnly se_refresh cookie to obtain a fresh access token first.
         *
         * This prevents application startup from treating a valid session
         * as logged out simply because the previous access token expired.
         */
        await restoreAuthSession();

        if (cancelled) return;

        await checkAppState();

      } catch (error) {
        if (cancelled) return;

        console.error("Initial authentication failed:", error);

        setAuthError({
          type: "unknown",
          message: error?.message || "Authentication error",
        });

        setIsAuthenticated(false);
        setUser(null);
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    };

    initializeAuth();

    const unsubscribe = onUnauthorized(() => {
      if (cancelled) return;

      setUser(null);
      setIsAuthenticated(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // ============================================================
  // LOAD CURRENT USER + APPLICATION DATA
  // ============================================================

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setIsLoadingAuth(true);
      setAuthError(null);

      const currentUser = await authApi.me();

      if (currentUser) {
        queryClientInstance.setQueryData(
          ["currentUser"],
          currentUser
        );

        setUser(currentUser);
        setIsAuthenticated(true);

        const uid = currentUser.id;

        /*
         * Once authentication is confirmed, warm the main application
         * queries for this user.
         */
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
        setUser(null);
        setIsAuthenticated(false);
      }

      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);
      setAuthChecked(true);
      setIsLoadingAuth(false);

    } catch (error) {
      console.error("Unexpected authentication error:", error);

      setAuthError({
        type: "unknown",
        message: error?.message || "Authentication error",
      });

      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  // ============================================================
  // MANUAL AUTH CHECK
  // ============================================================

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);

      /*
       * Also restore the session here because this function can be called
       * after the application has already been running for a while.
       */
      await restoreAuthSession();

      const currentUser = await authApi.me();

      queryClientInstance.setQueryData(
        ["currentUser"],
        currentUser
      );

      if (currentUser) {
        setUser(currentUser);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }

      setAuthChecked(true);

    } catch (error) {
      console.error(
        "User auth check failed:",
        error
      );

      setUser(null);
      setIsAuthenticated(false);
      setAuthChecked(true);

    } finally {
      setIsLoadingAuth(false);
    }
  };

  // ============================================================
  // LOGOUT
  // ============================================================

  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);

    queryClientInstance.clear();

    authApi.logout().finally(() => {
      window.location.href = "/login";
    });
  };

  // ============================================================
  // NAVIGATION
  // ============================================================

  const navigateToLogin = () => {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
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
        checkAppState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth must be used within an AuthProvider"
    );
  }

  return context;
};