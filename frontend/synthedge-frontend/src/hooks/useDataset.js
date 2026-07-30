import { useMemo } from "react";
import { DATASETS, normalizeTrades } from "@/lib/tradeAdapter";
import { useMode } from "@/lib/ModeContext";

export function useDataset() {
  const { mode, setMode } = useMode();
  const dataset = mode === "backtest" ? DATASETS.BACKTEST : DATASETS.LIVE;

  return useMemo(() => ({
    mode,
    setMode,
    dataset,
    isBacktest: dataset === DATASETS.BACKTEST,
    filterTrades: trades => normalizeTrades(trades).filter(trade => trade.dataset === dataset),
  }), [mode, setMode, dataset]);
}