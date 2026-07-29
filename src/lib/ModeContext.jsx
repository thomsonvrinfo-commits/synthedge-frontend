import React, { createContext, useContext, useState, useEffect } from "react";

const ModeContext = createContext({ mode: "live", setMode: () => {} });

export function ModeProvider({ children }) {
  const [mode, setModeState] = useState(() => localStorage.getItem("synthedge_mode") || "live");

  const setMode = (m) => {
    setModeState(m);
    localStorage.setItem("synthedge_mode", m);
  };

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>;
}

export function useMode() {
  return useContext(ModeContext);
}