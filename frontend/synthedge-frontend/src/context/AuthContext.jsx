import React, { createContext, useState, useContext, useEffect } from 'react';
import * as authApi from '@/api/auth';
import { getMyProfileAsList } from '@/api/profile';
import { listTrades } from '@/api/trades';
import { listTradingRules } from '@/api/tradingRules';
import { listReplaySessions } from '@/api/replaySessions';
import { onUnauthorized, setAuthToken } from '@/api/client';
import { queryClientInstance } from '@/lib/query-client';

const AuthContext = createContext();

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password"
];

export const AuthProvider = ({ children }) => {

  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
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

  console.log(
    "AFTER SAVE:",
    localStorage.getItem("synthedge_access_token")
  );

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


    checkAppState();


    const unsubscribe = onUnauthorized(() => {

      setUser(null);
      setIsAuthenticated(false);

    });


    return unsubscribe;


  }, []);



  const checkAppState = async () => {

    try {

      setIsLoadingPublicSettings(true);
      setIsLoadingAuth(true);
      setAuthError(null);


      const currentUser = await authApi.me();


      setAppPublicSettings(null);
      setIsLoadingPublicSettings(false);



      if (currentUser) {


        queryClientInstance.setQueryData(
          ["currentUser"],
          currentUser
        );


        setUser(currentUser);
        setIsAuthenticated(true);



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



    } catch(error) {


      console.error(
        "Unexpected error:",
        error
      );


      setAuthError({
        type:"unknown",
        message:error.message || "Authentication error"
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


      queryClientInstance.setQueryData(
        ["currentUser"],
        currentUser
      );


      if(currentUser){

        setUser(currentUser);
        setIsAuthenticated(true);

      }else{

        setUser(null);
        setIsAuthenticated(false);

      }


      setAuthChecked(true);



    }catch(error){

      console.error(
        "User auth check failed:",
        error
      );


      setIsAuthenticated(false);
      setAuthChecked(true);



    }finally{

      setIsLoadingAuth(false);

    }

  };




  const logout = () => {


    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthError(null);


    queryClientInstance.clear();


    authApi.logout().finally(() => {

      window.location.href="/login";

    });


  };




  const navigateToLogin = () => {

    if(window.location.pathname !== "/login"){

      window.location.href="/login";

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
        checkAppState
      }}
    >

      {children}

    </AuthContext.Provider>

  );

};



export const useAuth = () => {

  const context = useContext(AuthContext);


  if(!context){

    throw new Error(
      "useAuth must be used within an AuthProvider"
    );

  }


  return context;

};