import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createTrade } from "@/api/trades";
import {
  getReplaySession,
  createReplaySession,
  updateReplaySession,
  listReplaySessions,
} from "@/api/replaySessions";
import { me as getCurrentUser } from "@/api/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Loader2, AlertTriangle, RefreshCw, Maximize2, Minimize2, Lock
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDerivCandles } from "@/hooks/useDerivCandles";
import { useM1ReplaySource } from "@/hooks/useM1ReplaySource";
import { BACKTEST_INDICES } from "@/lib/derivWebSocket";
import { useProAccess } from "@/hooks/useProAccess";
import { buildTransform, priceDecimals, getPaddingR } from "@/lib/chartEngine";
import { getSymbolSpec } from "@/lib/symbolSpecs";
import { renderFrame } from "@/lib/chartRenderer";
import {
  hitTestObjects,
  applyDrag, resolveCursor, canvasToChart
} from "@/lib/objectInteractionService";
import {
  buildIndicatorSeries, activePanelKeys, DEFAULT_INDICATORS
} from "@/lib/indicatorEngine";
import { buildReplayCandles, buildLiveCandleSmart, nextReplayFrame, replayTimeFromPosition, positionFromReplayTime } from "@/lib/replayEngine";
import { useTheme } from "@/lib/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createReplayTrade, processReplayTrades, advanceReplayTrades, computeReplayStats, TRADE_STATES
} from "@/lib/tradeStateEngine";
import ReplayHeader from "@/components/backtest/ReplayHeader";
import FloatingToolbar from "@/components/backtest/FloatingToolbar";
import DateRangePicker from "@/components/backtest/DateRangePicker";
import TradeDrawer from "@/components/backtest/TradeDrawer";
import ReplayBottomBar from "@/components/backtest/ReplayBottomBar";
import ChartSettingsDrawer, { useChartSettings } from "@/components/backtest/ChartSettingsDrawer";
import FloatingZoomControls from "@/components/backtest/FloatingZoomControls";
import SessionBar from "@/components/backtest/SessionBar";
import SessionReflectionModal from "@/components/backtest/SessionReflectionModal";
import { anchorObjectToTime, reanchorObjectToIndex } from "@/lib/objectTimeAnchor";
import { trackLifecycleEvent } from "@/lib/lifecycleEvents";
// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_VISIBLE = 80;
const MIN_VISIBLE = 10;
// MAX_VISIBLE is dynamic (candles.length) — this is the hard cap for the constant
const MAX_VISIBLE_CAP = 100000;
const FREE_CANDLE_LIMIT = 1000;
const TIMEFRAMES = [
  { label: "1m",  value: 60,    key: "1" },
  { label: "5m",  value: 300,   key: "5" },
  { label: "15m", value: 900,   key: "F" },
  { label: "30m", value: 1800,  key: "T" },
  { label: "1h",  value: 3600,  key: "H" },
  { label: "4h",  value: 14400, key: "4" },
  { label: "D",   value: 86400, key: "D" },
];
let sessionCounter = Math.floor(Math.random() * 900) + 100;
export default function Backtest() {
  // ─── Core state ─────────────────────────────────────────────────────────
  const [index,        setIndex]        = useState("Volatility 75");
  const [granularity,  setGranularity]  = useState(3600);
  const [visibleCount, setVisibleCount] = useState(DEFAULT_VISIBLE);
  const [playing,      setPlaying]      = useState(false);
  const [speed,        setSpeed]        = useState(400);
  const [zoomWindow,   setZoomWindow]   = useState(DEFAULT_VISIBLE);
  const [panOffset,    setPanOffset]    = useState(0);
  const [focusMode,    setFocusMode]    = useState(false);
  const [vScale,       setVScale]       = useState(1.0); // vertical price scale multiplier
  const [currentReplayTime, setCurrentReplayTime] = useState(null);
  // panOffset: signed candle units. positive = pan into history, negative = pan into future (empty space)
  // ─── Replay Trades (isolated from live) ─────────────────────────────────
  const [replayTrades, setReplayTrades] = useState([]); // stateful replay trades
  const [trades,       setTrades]       = useState([]); // completed (legacy compat)
  const [activeTrade,  setActiveTrade]  = useState(null);
  const [entryPrice,   setEntryPrice]   = useState("");
  const [sl,           setSl]           = useState("");
  const [tp,           setTp]           = useState("");
  const [direction,    setDirection]    = useState("Buy");
  const [volume,       setVolume]       = useState("");
    const symbolSpec = useMemo(() => getSymbolSpec(index), [index]);
  const minVolume = symbolSpec?.minVolume ?? "";
  const volumeStep = symbolSpec?.volumeStep ?? "any";

  useEffect(() => {
    setVolume(symbolSpec?.minVolume != null ? String(symbolSpec.minVolume) : "");
  }, [symbolSpec]);
  // ─── Drawing objects ────────────────────────────────────────────────────
  const [objects,    setObjects]    = useState([]);
  const queryClient = useQueryClient();
  // Trades that failed to persist to the Trade entity — kept so we can retry
  // them and so the UI can warn the user instead of silently losing data.
  const [failedTradeSaves, setFailedTradeSaves] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId,  setEditingId]  = useState(null);
  const [activeTool, setActiveTool] = useState("select");
  const [ghost,      setGhost]      = useState(null);
  // ─── Text editing overlay ────────────────────────────────────────────────
  const [editingText, setEditingText] = useState(null);
  // ─── Indicators ─────────────────────────────────────────────────────────
  const [activeIndicators, setActiveIndicators] = useState(DEFAULT_INDICATORS);
  // ─── Session ────────────────────────────────────────────────────────────
  const [savingSession, setSavingSession] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings: chartSettings, updateSettings: updateChartSettings } = useChartSettings();
  // ─── Research Session ────────────────────────────────────────────────────
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const [activeSession, setActiveSession] = useState(null);
  const pendingSessionRef = useRef(null);
  const [showReflection, setShowReflection] = useState(false);
  // Guards against creating more than one lazy session if the user places
  // several trades in quick succession before the first create() resolves
  // and the URL/sessionId update lands.
  const sessionCreationInFlightRef = useRef(false);
  // ─── Refs ────────────────────────────────────────────────────────────────
  const canvasRef        = useRef(null);
  const transformRef     = useRef(null);
  const objectsRef       = useRef([]);
  const selectedIdRef    = useRef(null);
  const editingIdRef     = useRef(null);
  const dragRef          = useRef(null);
  const panRef           = useRef({ active: false, startClientX: 0, startOffset: 0 });
  const vScaleDragRef    = useRef(null);
  const hoverRef         = useRef({ id: null, handleKey: null, posHandle: null });
  const renderReqRef     = useRef(false);
  const renderStateRef   = useRef({});
  const replayRef        = useRef({ visibleCount: DEFAULT_VISIBLE, phase: 1, rafId: null, lastTs: 0 });
  const playingRef       = useRef(false);
  const replayTradesRef  = useRef([]);
  const currentReplayTimeRef = useRef(null);
  const pendingObjectRemapRef = useRef(null);
  const loadedGranularityRef = useRef(granularity);
  const m1CandlesRef         = useRef([]);
  const { candles, loading, error, fetchRecentCandles, fetchDateRangeCandles, fetchCandlesAroundTime } = useDerivCandles();
  const { m1Candles, ensureCoverage: ensureM1Coverage } = useM1ReplaySource();
  const { isPro } = useProAccess();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  // Keep refs in sync
  useEffect(() => { objectsRef.current    = objects;    }, [objects]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { editingIdRef.current  = editingId;  }, [editingId]);
  useEffect(() => { playingRef.current       = playing;      }, [playing]);
  useEffect(() => { m1CandlesRef.current     = m1Candles;    }, [m1Candles]);
  useEffect(() => { replayRef.current.visibleCount = visibleCount; }, [visibleCount]);
  useEffect(() => { replayTradesRef.current  = replayTrades; }, [replayTrades]);
  // ─── Load research session ────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    getReplaySession(sessionId).then(session => {
      if (!session) return;
      setActiveSession(session);
      pendingSessionRef.current = session;
      if (session.index_name) setIndex(session.index_name);
      if (session.granularity) setGranularity(session.granularity);
    }).catch(err => console.error("Failed to load session:", err));
  }, [sessionId]);
  // ─── Lazily create a session for "Quick Replay" entries ──────────────────
  // Quick Replay (navigate("/backtest/replay") with no "?session=" param)
  // previously meant every trade closed with replay_session_id=undefined —
  // permanently unattached to any ReplaySession, so the Hub always showed
  // Trades=0 / Win%=— / P/L=— for that run even though the trades themselves
  // saved fine to the Trade entity. Fix: the moment the user places their
  // first position with no active session, create one transparently and
  // attach it to the URL, so every trade from then on links correctly.
  const ensureSession = useCallback(async () => {
    if (sessionId || sessionCreationInFlightRef.current) return;
    sessionCreationInFlightRef.current = true;
    try {
      const session = await createReplaySession({
        name: `${index} — ${new Date().toLocaleDateString()}`,
        status: "active",
        started_at: new Date().toISOString(),
        index_name: index,
        granularity,
      });
      setActiveSession(session);
      const next = new URLSearchParams(searchParams);
      next.set("session", session.id);
      setSearchParams(next, { replace: true });
      queryClient.invalidateQueries({ queryKey: ["replaySessions"] });
    } catch (err) {
      console.error("Failed to lazily create replay session:", err);
    } finally {
      sessionCreationInFlightRef.current = false;
    }
  }, [sessionId, index, granularity, searchParams, setSearchParams, queryClient]);
  // Restore session drawings + position after candles load
 useEffect(() => {
    if (candles.length > 0 && pendingSessionRef.current) {
      const session = pendingSessionRef.current;
      pendingSessionRef.current = null;
      if (session.drawings?.length) setObjects(session.drawings);
      if (session.visible_count) {
        setVisibleCount(session.visible_count);
        replayRef.current.visibleCount = session.visible_count;
        const t = replayTimeFromPosition(candles, session.visible_count, 1, granularity);
        if (t != null) {
          currentReplayTimeRef.current = t;
          setCurrentReplayTime(t);
        }
      }
    }
  }, [candles.length]);
 // ─── Load candles: full session reset on symbol change ──────────────────
  useEffect(() => {
    currentReplayTimeRef.current = null;
    setCurrentReplayTime(null);
    fetchRecentCandles(index, granularity, isPro ? 100000 : 1000);
    setZoomWindow(DEFAULT_VISIBLE);
    setPanOffset(0);
    setPlaying(false);
    setActiveTrade(null);
    setTrades([]);
    setReplayTrades([]);
    setObjects([]);
    setGhost(null);
  }, [index]);

 // ─── Timeframe switch: preserve replay clock AND drawing positions ───
useEffect(() => {
  if (currentReplayTimeRef.current == null) return; 
  setPlaying(false);

  // Convert current drawings from candle indexes into real market timestamps
  // before the candle array changes.
  pendingObjectRemapRef.current = objectsRef.current.map(o =>
    anchorObjectToTime(
      o,
      candles,
      loadedGranularityRef.current
    )
  );

  fetchCandlesAroundTime(
    index,
    granularity,
    currentReplayTimeRef.current
  );

}, [granularity]);

  // ─── Universal Replay Clock: derive candle-index position from ──────────
  // currentReplayTime whenever the loaded candle array changes. Never
  // resets to index 0 except on a brand-new session.
  useEffect(() => {
    if (!candles.length) return;

    if (currentReplayTimeRef.current == null) {
      const startIdx = Math.min(DEFAULT_VISIBLE, candles.length) - 1;
      const startCandle = candles[startIdx];
      const t = (startCandle?.epoch ?? startCandle?.timestamp) + granularity;
      currentReplayTimeRef.current = t;
      setCurrentReplayTime(t);
      setVisibleCount(DEFAULT_VISIBLE);
      replayRef.current.visibleCount = DEFAULT_VISIBLE;
      replayRef.current.phase = 1;
    } else {
      const { visibleCount: vc, phase: ph } = positionFromReplayTime(
        candles, currentReplayTimeRef.current, granularity
      );
      setVisibleCount(vc);
      replayRef.current.visibleCount = vc;
      replayRef.current.phase = ph;
    }
      if (pendingObjectRemapRef.current) {

      const anchored = pendingObjectRemapRef.current;

      pendingObjectRemapRef.current = null;

      setObjects(
        anchored.map(o =>
          reanchorObjectToIndex(
            o,
            candles,
            granularity
          )
        )
      );
    }

    loadedGranularityRef.current = granularity;
    }, [candles]);

  // ─── Keep the replay clock in sync whenever position changes ────────────
  const syncReplayTime = useCallback((vc, ph) => {
    const t = replayTimeFromPosition(candles, vc, ph, granularity);
    if (t != null) {
      currentReplayTimeRef.current = t;
      setCurrentReplayTime(t);
    }
  }, [candles, granularity]);
  // ─── RAF render ──────────────────────────────────────────────────────────
  const scheduleRender = useCallback(() => {
    if (renderReqRef.current) return;
    renderReqRef.current = true;
    requestAnimationFrame(() => {
      renderReqRef.current = false;
      _doRender();
    });
  }, []);
  // Immediately hide the crosshair if the user disables it mid-hover,
  // rather than waiting for the next mouse/touch move to pick it up.
  useEffect(() => {
    if (chartSettings.crosshairEnabled === false && renderStateRef.current.showCrosshair) {
      renderStateRef.current.showCrosshair = false;
      scheduleRender();
    }
  }, [chartSettings.crosshairEnabled, scheduleRender]);
  function _doRender() {
    const canvas = canvasRef.current;
    const state  = renderStateRef.current;
    if (!canvas || !state.candles || state.candles.length === 0) return;
    const ctx  = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 2;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const maxVisible = state.totalCandleCount || MAX_VISIBLE_CAP;
    const pan = state.panOffset || 0; // signed: >0 = history, <0 = future slots
    const eff = Math.max(MIN_VISIBLE, Math.min(maxVisible, state.zoomWindow));
    // How many candle-slots of future space to show (panning right beyond latest candle)
    const futureSlots = pan < 0 ? Math.min(-pan, Math.round(eff * 0.5)) : 0;
    // How many history candles are skipped by leftward pan
    const historyPan = pan > 0 ? Math.min(pan, Math.max(0, state.visibleCount - eff)) : 0;
    const sliceEnd   = state.visibleCount - historyPan;
    const sliceStart = Math.max(0, sliceEnd - eff);
    const vis = state.candles.slice(sliceStart, sliceEnd);
    if (!vis.length) return;
    const panelKeys = state.indicatorPanels || [];
    const lowerPanelHeight = panelKeys.length > 0 ? panelKeys.length * 84 + 24 : 0;
    const transform = buildTransform({ visibleCandles: vis, sliceStart, W, H, lowerPanelHeight, vScale: state.vScale || 1.0, futureSlots });
    transformRef.current = transform;
    renderFrame(ctx, {
      transform,
      visibleCandles: vis,
      objects: objectsRef.current,
      selectedId: selectedIdRef.current,
      editingId: editingIdRef.current,
      hoveredId: hoverRef.current.id,
      hoverHandle: hoverRef.current.handleKey,
      activeTrade: state.activeTrade,
      indicatorSeries: state.indicatorSeries,
      indicatorPanels: panelKeys,
      ghost: state.ghost,
      mousePrice: state.mousePrice,
      mouseAbsIndex: state.mouseAbsIndex,
      showCrosshair: state.showCrosshair,
      currentPrice: state.candles[state.visibleCount - 1]?.close,
      theme: state.theme || "dark",
      chartSettings: state.chartSettings || {},
      replayTrades: state.replayTrades || [],
    });
  }
  // ─── Reliable trade persistence with retry + user-visible failure ─────────
  // Wraps Trade.create with retry (transient network/auth blips) and surfaces
  // any permanent failure instead of letting it vanish silently. On success,
  // invalidates the shared "trades" query so Journal/Dashboard/Calendar pick
  // it up immediately instead of waiting out their 5-minute staleTime.
  const saveTradeWithRetry = useCallback(async (payload, attempt = 1) => {
    const MAX_ATTEMPTS = 3;
    try {
      await createTrade(payload);
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      // Clear from the failed list if a previous attempt had landed there
      setFailedTradeSaves(prev => prev.filter(p => p !== payload));
    } catch (err) {
      console.error(`Trade.create failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, err, payload);
      if (attempt < MAX_ATTEMPTS) {
        const backoffMs = attempt * 1000;
        setTimeout(() => saveTradeWithRetry(payload, attempt + 1), backoffMs);
      } else {
        setFailedTradeSaves(prev => [...prev, payload]);
        toast.error(
          "A trade failed to save after 3 attempts — it will NOT appear in your Journal. " +
          "Click here to retry.",
          {
            action: {
              label: "Retry",
              onClick: () => saveTradeWithRetry(payload, 1),
            },
            duration: 15000,
          }
        );
      }
    }
  }, [queryClient]);
  // Save newly completed replay trades to the unified Trade entity (BACKTEST/REPLAY).
  // This is the ONLY thing Journal, Dashboard, and Calendar read from — the
  // session_trades/stats saved on ReplaySession (in saveSession() below) is
  // just a local snapshot for the Hub card and must never be treated as proof
  // these trades were actually persisted. Shared by both the active-playback
  // (RAF tick) and paused/manual-scrub trigger-processing paths so a trade
  // is saved identically no matter how its trigger was detected.
  const persistCompletedTrades = useCallback((newlyCompleted) => {
    if (!newlyCompleted?.length) return;
    newlyCompleted.forEach(t => {
      const exitMs = t.exitTime ? t.exitTime * 1000 : null;
      const tradeDate = (exitMs && isFinite(exitMs)) ? new Date(exitMs).toISOString() : new Date().toISOString();
      const payload = {
        dataset: "BACKTEST",
        source: "REPLAY",
        symbol: index,
        synthetic_index: index,
        direction: t.direction,
        entry_price: t.entry,
        exit_price: t.exitPrice,
        stop_loss: t.sl,
        take_profit: t.tp,
        rr: t.rr,
        pl: t.profitLoss,
        risk_reward_ratio: t.rr,
        profit_loss: t.profitLoss,
        result: t.result,
        trade_date: tradeDate,
        notes: "Backtest replay trade — P/L is price-difference based (no stake captured)",
        replay_session_id: sessionId || undefined,
      };
      saveTradeWithRetry(payload);
    });
  }, [index, sessionId, saveTradeWithRetry]);
  // ─── RAF-based playback loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!playing || candles.length === 0) return;
    replayRef.current.lastTs = performance.now();
    const tick = (ts) => {
      if (!playingRef.current) return;
      const deltaMs = ts - replayRef.current.lastTs;
      replayRef.current.lastTs = ts;
      const prevVisibleCount = replayRef.current.visibleCount;
      const next = nextReplayFrame({
        visibleCount: replayRef.current.visibleCount,
        phase: replayRef.current.phase,
        deltaMs,
        speed,
        total: candles.length,
      });
    const completedNewCandle = next.visibleCount !== replayRef.current.visibleCount;
      replayRef.current.visibleCount = next.visibleCount;
      replayRef.current.phase = next.phase;
      syncReplayTime(next.visibleCount, next.phase);

      // ── Trigger check: evaluate EVERY candle that closed this frame (using
      // its true final High/Low) plus the live in-progress candle at its
      // current reveal phase — not just a React-state snapshot that only
      // updates once per completed candle. See advanceReplayTrades() for why.
      if (replayTradesRef.current.length) {
        const { updatedTrades, newlyCompleted } = advanceReplayTrades(
          replayTradesRef.current, candles, prevVisibleCount, next.visibleCount, next.phase,
          (candle, phase) => buildLiveCandleSmart(candle, phase, m1CandlesRef.current, granularity)
        );
        const changed = updatedTrades.some((t, i) => t.state !== replayTradesRef.current[i]?.state);
        if (changed) {
          replayTradesRef.current = updatedTrades;
          setReplayTrades(updatedTrades);
          setTrades(updatedTrades.filter(t =>
            t.state === TRADE_STATES.TP_HIT || t.state === TRADE_STATES.SL_HIT
          ));
          persistCompletedTrades(newlyCompleted);
        }
      }

      const replayCandlesNow = buildReplayCandles(candles, next.visibleCount, next.phase, {
        m1Candles: m1CandlesRef.current, granularitySeconds: granularity,
      });
      renderStateRef.current = {
        ...renderStateRef.current,
        candles: replayCandlesNow,
        visibleCount: replayCandlesNow.length,
        totalCandleCount: candles.length,
        indicatorSeries: buildIndicatorSeries(replayCandlesNow, activeIndicators),
        theme,
        chartSettings,
        replayTrades: replayTradesRef.current,
      };
      scheduleRender();
      if (completedNewCandle) setVisibleCount(next.visibleCount);
      if (next.done) {
        setVisibleCount(next.visibleCount);
        setPlaying(false);
        return;
      }
      replayRef.current.rafId = requestAnimationFrame(tick);
    };
    replayRef.current.rafId = requestAnimationFrame(tick);
    return () => {
      if (replayRef.current.rafId) cancelAnimationFrame(replayRef.current.rafId);
    };
    }, [playing, speed, candles, granularity, activeIndicators, theme, chartSettings, scheduleRender, syncReplayTime, persistCompletedTrades]);
  // ─── Keep M1 coverage synced to the currently-forming replay candle ──────
  // This is what lets buildReplayCandles() build the in-progress candle from
  // real sub-candle data instead of a synthesized (future-aware) path.
  useEffect(() => {
    if (!candles.length) return;
    const idx = Math.max(0, Math.min(visibleCount, candles.length) - 1);
    const anchor = candles[idx];
    const anchorEpoch = anchor?.epoch ?? anchor?.timestamp;
    if (anchorEpoch == null) return;
    ensureM1Coverage(index, granularity, anchorEpoch);
  }, [candles, visibleCount, granularity, index, ensureM1Coverage]);
  // ─── Replay candles (static state) ───────────────────────────────────────
  const replayCandles = useMemo(
    () => buildReplayCandles(candles, visibleCount, playing ? replayRef.current.phase : 1, {
      m1Candles, granularitySeconds: granularity,
    }),
    [candles, visibleCount, playing, m1Candles, granularity]
  );
  const indicatorSeries = useMemo(() => buildIndicatorSeries(replayCandles, activeIndicators), [replayCandles, activeIndicators]);
  const indicatorPanels = useMemo(() => activePanelKeys(activeIndicators), [activeIndicators]);
  // ─── Sync position objects → replayTrades lifecycle engine ──────────────
  // Position objects in objects[] are the source of truth.
  // replayTrades mirrors them for state machine processing (waiting→active→tp/sl hit).
  useEffect(() => {
    const positionObjs = objects.filter(o => o.type === "position");
    if (!positionObjs.length) {
      setReplayTrades([]);
      setTrades([]);
      return;
    }
    setReplayTrades(prev => {
      const prevMap = new Map(prev.map(t => [t.id, t]));
      return positionObjs.map(obj => {
        const existing = prevMap.get(obj.id);
        if (existing && (existing.state === TRADE_STATES.TP_HIT || existing.state === TRADE_STATES.SL_HIT)) {
          // Keep completed state, but update prices if user adjusted them
          return { ...existing, entry: obj.entry, sl: obj.sl, tp: obj.tp };
        }
        if (existing) {
          // Update prices + position bounds (user may have dragged handles), preserve lifecycle state
          return { ...existing, entry: obj.entry, sl: obj.sl, tp: obj.tp,
            startAbsIndex: obj.startAbsIndex, widthCandles: obj.widthCandles };
        }
        // New position object — create a replay trade in WAITING state
        return createReplayTrade({
          id: obj.id,
          direction: obj.direction,
          entry: obj.entry,
          sl: obj.sl,
          tp: obj.tp,
          placedAtIndex: obj.placedAtIndex,
          placedAtTime: obj.placedAtTime,
          startAbsIndex: obj.startAbsIndex,
          widthCandles: obj.widthCandles,
        });
      });
    });
  }, [objects]);
  // ─── Replay trade state processing (paused / manual-scrub path only) ────
  // While actively playing, the RAF tick loop above owns trigger processing
  // (it can see every candle that closes, not just a once-per-candle React
  // snapshot). This effect only needs to run when the user isn't playing —
  // e.g. stepping/scrubbing manually with the transport controls — where
  // replayCandles' live candle is always at phase=1 (fully formed) and a
  // single evaluation per position change is correct and sufficient.
  useEffect(() => {
    if (playing) return;
    if (!replayTrades.length) return;
    const liveCandle = replayCandles[replayCandles.length - 1];
    if (!liveCandle) return;
    const { updatedTrades, newlyCompleted } = processReplayTrades(
      replayTrades, liveCandle, replayCandles.length - 1
    );
    const hasChanges = updatedTrades.some((t, i) => t.state !== replayTrades[i]?.state);
    if (hasChanges) {
      setReplayTrades(updatedTrades);
      const completed = updatedTrades.filter(t =>
        t.state === TRADE_STATES.TP_HIT || t.state === TRADE_STATES.SL_HIT
      );
      setTrades(completed);
      // Save newly completed trades to the unified Trade entity as BACKTEST/REPLAY.
      // This is the ONLY thing Journal, Dashboard, and Calendar read from — the
      // session_trades/stats saved on ReplaySession (in saveSession() below) is
      // just a local snapshot for the Hub card and must never be treated as proof
      // these trades were actually persisted.
      persistCompletedTrades(newlyCompleted);
    }
  }, [replayCandles, playing, persistCompletedTrades]);
  // ─── Sync render state ───────────────────────────────────────────────────
  useEffect(() => {
    renderStateRef.current = {
      candles: replayCandles,
      visibleCount: replayCandles.length,
      totalCandleCount: candles.length,
      zoomWindow, panOffset, activeTrade, ghost,
      indicatorSeries, indicatorPanels, theme, chartSettings, vScale,
      replayTrades,
    };
    scheduleRender();
  }, [replayCandles, visibleCount, zoomWindow, panOffset, activeTrade, ghost,
      objects, selectedId, editingId, indicatorSeries, indicatorPanels,
      theme, chartSettings, vScale, replayTrades, scheduleRender]);
  // ─── Coordinate helpers ──────────────────────────────────────────────────
  const getChartCoords = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas || !transformRef.current) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const { price, absIndex } = canvasToChart(mx, my, transformRef.current);
    return { mx, my, price, absIndex };
  }, []);
  // ─── Price axis hit test helper ──────────────────────────────────────────
  const isOnPriceAxis = useCallback((clientX) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return x >= rect.width - getPaddingR();
  }, []);
  // ─── Wheel zoom (chart area = horizontal, price axis = vertical) ─────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    if (isOnPriceAxis(e.clientX)) {
      // Price-axis vertical scale
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setVScale(p => Math.max(0.2, Math.min(8, p * factor)));
    } else {
      // Horizontal zoom — step size scales with current zoom level for smooth feel
      const maxVis = candles.length || MAX_VISIBLE_CAP;
      setZoomWindow(p => {
        const step = p < 60 ? 3 : p < 200 ? 8 : p < 500 ? 20 : 40;
        const delta = e.deltaY > 0 ? 1 : -1;
        return Math.max(MIN_VISIBLE, Math.min(maxVis, p + delta * step));
      });
    }
  }, [isOnPriceAxis, candles.length]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);
  // ─── Price axis mouse down (drag-to-scale + dbl-click reset) ────────────
  const handlePriceAxisMouseDown = useCallback((e) => {
    if (!isOnPriceAxis(e.clientX)) return false;
    e.preventDefault();
    vScaleDragRef.current = { startY: e.clientY, startVScale: vScaleDragRef.current?.startVScale || 1.0 };
    // store current vScale at drag start via closure — we'll read from renderStateRef
    vScaleDragRef.current.startVScale = renderStateRef.current.vScale || 1.0;
    return true;
  }, [isOnPriceAxis]);
  const handlePriceAxisMouseMove = useCallback((e) => {
    if (!vScaleDragRef.current) return;
    const dy = vScaleDragRef.current.startY - e.clientY; // drag up = positive
    const factor = 1 + dy * 0.005;
    const newScale = Math.max(0.2, Math.min(8, vScaleDragRef.current.startVScale * factor));
    setVScale(newScale);
    renderStateRef.current.vScale = newScale;
    scheduleRender();
  }, [scheduleRender]);
  const handlePriceAxisMouseUp = useCallback(() => {
    vScaleDragRef.current = null;
  }, []);
  // ─── Touch (mobile) — mirrors mouse: pinch-zoom, pan, object drag, ────────
  // price-axis vertical scale, and double-tap-to-reset.
  const pinchRef = useRef(null);
  const touchPanRef = useRef(null);
  const lastTapRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const touchCrosshairRef = useRef(false);
  const touchStartPosRef = useRef(null);
  const handleTouchStart = useCallback((e) => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: zoomWindowRef.current || DEFAULT_VISIBLE,
      };
      touchPanRef.current = null;
      dragRef.current = null;
      vScaleDragRef.current = null;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      // Touching the price axis = vertical scale drag (same as mouse drag-to-scale)
      if (isOnPriceAxis(t.clientX)) {
        vScaleDragRef.current = { startY: t.clientY, startVScale: renderStateRef.current.vScale || 1.0 };
        touchPanRef.current = null;
        return;
      }
      // Touching a drawing object / trade handle = drag it (select tool only)
      if (activeTool === "select") {
        const coords = getChartCoords(t.clientX, t.clientY);
        if (coords) {
          const { mx, my, price, absIndex } = coords;
          const hit = hitTestObjects(objectsRef.current, mx, my, transformRef.current, { includeHandles: true });
          if (hit) {
            setSelectedId(hit.id); selectedIdRef.current = hit.id;
            dragRef.current = { type: "object", id: hit.id, handleKey: hit.handleKey,
              startPrice: price, startIndex: absIndex };
            touchPanRef.current = null;
            return;
          }
        }
      }
      // Otherwise: pan the chart — but if the finger holds still for a
      // beat instead of dragging, switch to a TradingView-style crosshair
      // that follows the finger (select tool only, and only if enabled).
      touchPanRef.current = { startClientX: t.clientX, startOffset: panOffset };
      touchStartPosRef.current = { x: t.clientX, y: t.clientY };
      if (activeTool === "select" && chartSettings.crosshairEnabled !== false) {
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          touchPanRef.current = null; // cancel pan — this gesture is now a crosshair
          touchCrosshairRef.current = true;
          const coords = getChartCoords(t.clientX, t.clientY);
          if (coords) {
            renderStateRef.current.mousePrice    = coords.price;
            renderStateRef.current.mouseAbsIndex = coords.absIndex;
            renderStateRef.current.showCrosshair = true;
            scheduleRender();
          }
        }, 400);
      }
    }
  }, [panOffset, isOnPriceAxis, activeTool, getChartCoords, chartSettings, scheduleRender]);
  const zoomWindowRef = useRef(DEFAULT_VISIBLE);
  useEffect(() => { zoomWindowRef.current = zoomWindow; }, [zoomWindow]);
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = pinchRef.current.startDist / dist;
      const maxVis = candles.length || MAX_VISIBLE_CAP;
      const newZoom = Math.max(MIN_VISIBLE, Math.min(maxVis, Math.round(pinchRef.current.startZoom * ratio)));
      setZoomWindow(newZoom);
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    // Any real movement cancels a pending long-press-to-crosshair timer —
    // the user is dragging (panning), not holding still.
    if (longPressTimerRef.current && touchStartPosRef.current) {
      const dx = t.clientX - touchStartPosRef.current.x;
      const dy = t.clientY - touchStartPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    // Crosshair mode (activated by long-press) — finger drags the
    // crosshair around instead of panning the chart.
    if (touchCrosshairRef.current) {
      e.preventDefault();
      const coords = getChartCoords(t.clientX, t.clientY);
      if (coords) {
        renderStateRef.current.mousePrice    = coords.price;
        renderStateRef.current.mouseAbsIndex = coords.absIndex;
        scheduleRender();
      }
      return;
    }
    // Price-axis vertical scale drag
    if (vScaleDragRef.current) {
      e.preventDefault();
      const dy = vScaleDragRef.current.startY - t.clientY;
      const factor = 1 + dy * 0.005;
      const newScale = Math.max(0.2, Math.min(8, vScaleDragRef.current.startVScale * factor));
      setVScale(newScale);
      renderStateRef.current.vScale = newScale;
      scheduleRender();
      return;
    }
    // Dragging a selected object / handle
    if (dragRef.current?.type === "object") {
      e.preventDefault();
      const coords = getChartCoords(t.clientX, t.clientY);
      if (!coords) return;
      const { price, absIndex } = coords;
      const drag = dragRef.current;
      const dPrice = price - drag.startPrice;
      const dIndex = absIndex - drag.startIndex;
      if (Math.abs(dPrice) > 0 || Math.abs(dIndex) > 0) {
        setObjects(prev => prev.map(o =>
          o.id === drag.id ? applyDrag(o, drag.handleKey, dPrice, dIndex) : o
        ));
        drag.startPrice = price;
        drag.startIndex = absIndex;
      }
      return;
    }
    // Panning
    if (touchPanRef.current) {
      e.preventDefault();
      const transform = transformRef.current;
      if (!transform) return;
      const dx = touchPanRef.current.startClientX - t.clientX;
      const rw = transform.rawCandleW || 10;
      const delta = Math.round(dx / rw);
      const newOff = touchPanRef.current.startOffset + delta;
      const maxHistory = Math.max(0, visibleCount - MIN_VISIBLE);
      const maxFuture  = -Math.round((zoomWindowRef.current || DEFAULT_VISIBLE) * 0.5);
      const clamped = Math.max(maxFuture, Math.min(newOff, maxHistory));
      setPanOffset(clamped);
      renderStateRef.current.panOffset = clamped;
      scheduleRender();
    }
  }, [candles.length, visibleCount, scheduleRender, getChartCoords]);
  const handleTouchEnd = useCallback((e) => {
    const wasOnPriceAxis = !!vScaleDragRef.current;
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (touchCrosshairRef.current) {
      touchCrosshairRef.current = false;
      renderStateRef.current.showCrosshair = false;
      scheduleRender();
    }
    pinchRef.current = null;
    touchPanRef.current = null;
    vScaleDragRef.current = null;
    dragRef.current = null;
    // Double-tap the price axis = reset zoom/scale (mirrors double-click)
    if (wasOnPriceAxis && e.changedTouches?.length === 1) {
      const now = Date.now();
      const t = e.changedTouches[0];
      if (lastTapRef.current && now - lastTapRef.current.time < 350 && isOnPriceAxis(t.clientX)) {
        setVScale(1.0);
        setZoomWindow(DEFAULT_VISIBLE);
        lastTapRef.current = null;
      } else {
        lastTapRef.current = { time: now };
      }
    }
  }, [isOnPriceAxis, scheduleRender]);
  // ─── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      const k = e.key.toUpperCase();
      const tf = TIMEFRAMES.find(t => t.key === k);
      if (tf) { setGranularity(tf.value); return; }
      if (e.key === "ArrowRight") { stepForward(); return; }
      if (e.key === "ArrowLeft")  { stepBack(); return; }
      if (e.key === " ")          { e.preventDefault(); setPlaying(p => !p); return; }
      if (k === "F")              { setFocusMode(p => !p); return; }
      if (e.key === "+" || e.key === "=") { setZoomWindow(p => Math.max(MIN_VISIBLE, p - Math.max(3, Math.round(p * 0.12)))); return; }
      if (e.key === "-")          { setZoomWindow(p => { const maxV = candles.length || MAX_VISIBLE_CAP; return Math.min(maxV, p + Math.max(3, Math.round(p * 0.12))); }); return; }
      if (e.key === "0")          { setZoomWindow(DEFAULT_VISIBLE); setVScale(1.0); return; }
      if (k === "A" && e.altKey) { setZoomWindow(candles.length); return; } // Alt+A = fit all
      if (k === "ESCAPE") {
        setGhost(null); setActiveTool("select");
        if (editingIdRef.current) { setEditingId(null); editingIdRef.current = null; }
        setFocusMode(false);
        return;
      }
      if (e.key === "Enter" && activeTool === "path" && ghost?.type === "path" && ghost.points.length >= 2) {
        setObjects(prev => [...prev, { id: Date.now(), type: "path", points: ghost.points }]);
        setGhost(null); setActiveTool("select");
        return;
      }
      if (k === "DELETE" || k === "BACKSPACE") {
        const sel = selectedIdRef.current;
        if (sel) {
          setObjects(prev => prev.filter(o => o.id !== sel));
          setSelectedId(null);  selectedIdRef.current = null;
          setEditingId(null);   editingIdRef.current  = null;
        }
        return;
      }
      const toolMap = { S: "select", H: "hline", Y: "ray", V: "vline", T: "tline",
                        Z: "rect", B: "fib", A: "arrow", L: "text", G: "long", R: "short", P: "path" };
      if (toolMap[k]) { setActiveTool(toolMap[k]); setGhost(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPro, activeTool, ghost]);
  // ─── Mouse handlers ───────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Price-axis drag-to-scale
    if (e.button === 0 && handlePriceAxisMouseDown(e)) return;
    const coords = getChartCoords(e.clientX, e.clientY);
    if (!coords) return;
    const { mx, my, price, absIndex } = coords;
    const transform = transformRef.current;
    const tool = activeTool;
    if (tool === "select") {
      // Position objects are always draggable on mousedown (single-click select + drag)
      const hit = hitTestObjects(objectsRef.current, mx, my, transform, { includeHandles: true });
      if (hit) {
        // Select it
        setSelectedId(hit.id); selectedIdRef.current = hit.id;
        // Start drag immediately — position handles work on single click
        dragRef.current = { type: "object", id: hit.id, handleKey: hit.handleKey,
          startPrice: price, startIndex: absIndex };
        return;
      }
      setSelectedId(null);  selectedIdRef.current = null;
      setEditingId(null);   editingIdRef.current  = null;
      panRef.current = { active: true, startClientX: e.clientX, startOffset: panOffset };
      return;
    }
    if (e.button === 1) {
      panRef.current = { active: true, startClientX: e.clientX, startOffset: panOffset };
    }
  }, [activeTool, panOffset, getChartCoords]);
  const handleMouseMove = useCallback((e) => {
    // Price-axis vertical scale drag
    if (vScaleDragRef.current) { handlePriceAxisMouseMove(e); return; }
    const coords = getChartCoords(e.clientX, e.clientY);
    if (!coords) return;
    const { mx, my, price, absIndex } = coords;
    const transform = transformRef.current;
    renderStateRef.current.mousePrice    = price;
    renderStateRef.current.mouseAbsIndex = absIndex;
    renderStateRef.current.showCrosshair = chartSettings.crosshairEnabled !== false;
    const drag = dragRef.current;
    if (drag?.type === "object") {
      const dPrice = price - drag.startPrice;
      const dIndex = absIndex - drag.startIndex;
      if (Math.abs(dPrice) > 0 || Math.abs(dIndex) > 0) {
        setObjects(prev => prev.map(o =>
          o.id === drag.id ? applyDrag(o, drag.handleKey, dPrice, dIndex) : o
        ));
        drag.startPrice = price;
        drag.startIndex = absIndex;
      }
      return;
    }
    if (panRef.current.active) {
      const { startClientX, startOffset } = panRef.current;
      const dx = startClientX - e.clientX; // drag left = positive dx = pan into history
      const rw = transform?.rawCandleW || 10;
      const delta = Math.round(dx / rw);
      const newOff = startOffset + delta;
      // Clamp: left bound = don't pan past earliest candle; right bound = max ~50% of zoom into future
      const maxHistory = Math.max(0, visibleCount - MIN_VISIBLE);
      const maxFuture  = -Math.round((renderStateRef.current.zoomWindow || DEFAULT_VISIBLE) * 0.5);
      setPanOffset(Math.max(maxFuture, Math.min(newOff, maxHistory)));
      // Update renderState immediately for smooth panning without waiting for react re-render
      renderStateRef.current.panOffset = Math.max(maxFuture, Math.min(newOff, maxHistory));
      scheduleRender();
      return;
    }
    const hit = hitTestObjects(objectsRef.current, mx, my, transform);
    const hovId     = hit?.id || null;
    const hovHandle = hit?.handleKey || null;
    const prev = hoverRef.current;
    if (prev.id !== hovId || prev.handleKey !== hovHandle) {
      hoverRef.current = { id: hovId, handleKey: hovHandle, posHandle: null };
      const canvas = canvasRef.current;
      if (canvas) canvas.style.cursor = resolveCursor(activeTool, null, hovHandle, hovId, null, editingIdRef.current);
      scheduleRender();
    } else {
      scheduleRender();
    }
  }, [activeTool, getChartCoords, scheduleRender, visibleCount, chartSettings]);
  const handleMouseUp = useCallback(() => {
    dragRef.current       = null;
    panRef.current.active = false;
    handlePriceAxisMouseUp();
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = activeTool !== "select" ? "crosshair" : "default";
  }, [activeTool, handlePriceAxisMouseUp]);
  const handleCanvasMouseLeave = useCallback(() => {
    renderStateRef.current.showCrosshair = false;
    scheduleRender();
    handleMouseUp();
  }, [handleMouseUp, scheduleRender]);
  const handleCanvasDblClick = useCallback((e) => {
    // Double-click price axis = reset view
    if (isOnPriceAxis(e.clientX)) {
      setVScale(1.0);
      setZoomWindow(DEFAULT_VISIBLE);
      return;
    }
    if (activeTool === "path" && ghost?.type === "path") {
      // A double-click fires two click events first (each adding a vertex
      // via handleCanvasClick) before this dblclick event — the last
      // vertex is a near-duplicate of the one before it, so drop it.
      const pts = ghost.points.slice(0, -1);
      if (pts.length >= 2) {
        setObjects(prev => [...prev, { id: Date.now(), type: "path", points: pts }]);
      }
      setGhost(null);
      setActiveTool("select");
      return;
    }
    if (activeTool !== "select") return;
    const coords = getChartCoords(e.clientX, e.clientY);
    if (!coords) return;
    const { mx, my } = coords;
    const hit = hitTestObjects(objectsRef.current, mx, my, transformRef.current, { includeHandles: true });
    if (hit) {
      setEditingId(hit.id);   editingIdRef.current  = hit.id;
      setSelectedId(hit.id);  selectedIdRef.current = hit.id;
    }
  }, [activeTool, ghost, getChartCoords, isOnPriceAxis]);
  const handleCanvasClick = useCallback((e) => {
    if (dragRef.current) return;
    const coords = getChartCoords(e.clientX, e.clientY);
    if (!coords) return;
    const { price, absIndex, mx, my } = coords;
    if (activeTool === "select") {
      const hit = hitTestObjects(objectsRef.current, mx, my, transformRef.current);
      if (hit) {
        setSelectedId(hit.id); selectedIdRef.current = hit.id;
        if (editingIdRef.current && editingIdRef.current !== hit.id) {
          setEditingId(null); editingIdRef.current = null;
        }
      } else {
        setSelectedId(null); selectedIdRef.current = null;
        setEditingId(null);  editingIdRef.current  = null;
      }
      return;
    }
    // Long / Short position tools — create a unified position object in the drawing system
    if (activeTool === "long" || activeTool === "short") {
      const dir = activeTool === "long" ? "Buy" : "Sell";
      const spread = Math.max(price * 0.0005, price * 0.001);
      const slPrice = dir === "Buy" ? price - spread * 5  : price + spread * 5;
      const tpPrice = dir === "Buy" ? price + spread * 10 : price - spread * 10;
      const newId = Date.now();
      // Create as a drawing object (fully interactive: select, drag, resize)
      const posObj = {
        id: newId,
        type: "position",
        direction: dir,
        entry: price,
        sl: slPrice,
        tp: tpPrice,
        placedAtIndex: absIndex,
        placedAtTime: replayCandles[replayCandles.length - 1]?.time,
        startAbsIndex: absIndex - 5,   // place entry line slightly right of left edge
        widthCandles: 30,              // default compact width (~200px at normal zoom)
      };
      setObjects(prev => [...prev, posObj]);
      // Select it immediately
      setSelectedId(newId); selectedIdRef.current = newId;
      // Auto return to select
      setActiveTool("select");
      // Make sure this trade will be attached to a real session (see
      // ensureSession above — covers the "Quick Replay" no-session entry).
      ensureSession();
      return;
    }
    if (!isPro && ["tline", "rect", "arrow", "vline", "text", "ray", "path"].includes(activeTool)) return;
    if (activeTool === "hline") {
      setObjects(prev => [...prev, { id: Date.now(), type: "hline", price }]);
      setActiveTool("select"); // auto-return
      return;
    }
    if (activeTool === "path") {
      // Multi-point: every click adds a vertex. Finished via double-click
      // or Enter (see handleCanvasDblClick / the keyboard shortcut effect),
      // not on this single click — unlike every other draw tool here.
      if (!ghost || ghost.type !== "path") {
        setGhost({ type: "path", points: [{ price, absIndex }] });
      } else {
        setGhost(prev => ({ ...prev, points: [...prev.points, { price, absIndex }] }));
      }
      return;
    }
    if (activeTool === "ray") {
      setObjects(prev => [...prev, {
        id: Date.now(), type: "ray", price, absIndex,
        extendRight: true, extendLeft: false,
        lineStyle: "solid", thickness: 1.5, showPriceLabel: true,
      }]);
      setActiveTool("select"); // auto-return
      return;
    }
    if (activeTool === "vline") {
      setObjects(prev => [...prev, { id: Date.now(), type: "vline", absIndex }]);
      setActiveTool("select");
      return;
    }
    if (activeTool === "text") {
      const newId = Date.now();
      const rect = canvasRef.current.getBoundingClientRect();
      setObjects(prev => [...prev, { id: newId, type: "text", price, absIndex, label: "" }]);
      setEditingText({ id: newId, x: e.clientX - rect.left, y: e.clientY - rect.top });
      setActiveTool("select");
      return;
    }
    if (!ghost) {
      setGhost({ type: activeTool, p1: { price, absIndex } });
    } else {
      setObjects(prev => [...prev, { id: Date.now(), type: activeTool, p1: ghost.p1, p2: { price, absIndex } }]);
      setGhost(null);
      setActiveTool("select"); // auto-return after 2-click tools
    }
  }, [activeTool, ghost, isPro, getChartCoords, replayCandles]);
  // ─── Replay controls ─────────────────────────────────────────────────────
  const stepForward = useCallback(() => {
    replayRef.current.phase = 1;
    setVisibleCount(p => {
      const n = Math.min(p + 1, candles.length);
      replayRef.current.visibleCount = n;
      syncReplayTime(n, 1);
      return n;
    });
  }, [candles.length, syncReplayTime]);
  const stepBack = useCallback(() => {
    replayRef.current.phase = 1;
    setVisibleCount(p => {
      const n = Math.max(p - 1, 1);
      replayRef.current.visibleCount = n;
      syncReplayTime(n, 1);
      return n;
    });
    setActiveTrade(null);
  }, [syncReplayTime]);
  const skipBack10 = useCallback(() => {
    if (!isPro) return;
    replayRef.current.phase = 1;
    setVisibleCount(p => {
      const n = Math.max(p - 10, 1);
      replayRef.current.visibleCount = n;
      syncReplayTime(n, 1);
      return n;
    });
    setActiveTrade(null);
  }, [isPro, syncReplayTime]);
  const skipForward10 = useCallback(() => {
    replayRef.current.phase = 1;
    setVisibleCount(p => {
      const n = Math.min(p + 10, candles.length);
      replayRef.current.visibleCount = n;
      syncReplayTime(n, 1);
      return n;
    });
  }, [candles.length, syncReplayTime]);
const handleRefresh = () => {
    currentReplayTimeRef.current = null;
    setCurrentReplayTime(null);
    replayRef.current.visibleCount = DEFAULT_VISIBLE;
    replayRef.current.phase = 1;
    setVisibleCount(DEFAULT_VISIBLE); setZoomWindow(DEFAULT_VISIBLE); setVScale(1.0);
    setPanOffset(0); setPlaying(false); setActiveTrade(null);
    setTrades([]); setReplayTrades([]); setObjects([]); setGhost(null);
    fetchRecentCandles(index, granularity, isPro ? 100000 : 1000);
  };
  const handleDateRangeApply = useCallback((fromEpoch, toEpoch) => {
  // Reset the replay clock — without this, the "Universal Replay Clock"
  // effect (which fires whenever `candles` changes) would treat the new
  // date-range array as just another reload and re-derive the position
  // from the *previous* currentReplayTime, landing wherever that old
  // moment falls in the new range instead of at its very start.
  currentReplayTimeRef.current = null;
  setCurrentReplayTime(null);
  replayRef.current.visibleCount = DEFAULT_VISIBLE;
  replayRef.current.phase = 1;
  setVisibleCount(DEFAULT_VISIBLE);
  setZoomWindow(DEFAULT_VISIBLE);
  setVScale(1.0);
  setPanOffset(0);
  setPlaying(false);
  setActiveTrade(null);
  setTrades([]);
  setReplayTrades([]);
  setObjects([]);
  setGhost(null);
  fetchDateRangeCandles(index, granularity, fromEpoch, toEpoch);
}, [index, granularity, fetchDateRangeCandles]);
  // ─── Trade placement ─────────────────────────────────────────────────────
  const placeTrade = () => {
    const ep = parseFloat(entryPrice) || currentPrice;
    const slV = parseFloat(sl), tpV = parseFloat(tp);
    if (!slV || !tpV || !ep) return;
    setActiveTrade({ direction, entryPrice: ep, sl: slV, tp: tpV });
    setEntryPrice("");
  };
  // ─── Autosave drawings + replay position every 20s ─────────────────────────
  // Previously, drawings/visible_count were ONLY persisted when the user
  // clicked Save or Complete — any work done between those moments was lost
  // on refresh/navigation. This periodic snapshot closes that gap.
  useEffect(() => {
    if (!sessionId || !isPro) return;
    const interval = setInterval(() => {
      const drawings = objects.filter(o => o.type !== "position");
      updateReplaySession(sessionId, {
        drawings,
        visible_count: visibleCount,
      }).catch(err => console.error("Autosave failed:", err));
    }, 20000);
    return () => clearInterval(interval);
  }, [sessionId, isPro, objects, visibleCount]);
  const saveSession = async () => {
    setSavingSession(true);
    // Enforce free-tier: 5 sessions/month max
    if (!isPro) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const sessions = await listReplaySessions({ limit: 10 });
      const thisMonthSessions = sessions.filter(s => new Date(s.created_date) >= startOfMonth);
      if (thisMonthSessions.length >= 5) {
        toast.error("Free plan limit: 5 replay sessions per month. Upgrade to Pro for unlimited sessions.");
        setSavingSession(false);
        return;
      }
    }
    const stats = computeReplayStats(replayTrades);
    // Save drawings separately from position objects (they're in objects[])
    const drawings = objects.filter(o => o.type !== "position");
    const sessionData = {
      index_name: index, granularity, visible_count: visibleCount,
      candle_start_epoch: candles[0]?.epoch || 0,
      drawings,
      session_trades: replayTrades.map(t => ({
        direction: t.direction, entry: t.entry, sl: t.sl, tp: t.tp,
        state: t.state, result: t.result, rr: t.rr, profitLoss: t.profitLoss,
      })),
      stats: { trades: stats.total, wins: stats.wins, winRate: stats.winRate, totalPL: stats.totalPL },
    };
    if (sessionId) {
      await updateReplaySession(sessionId, sessionData);
      toast.success("Session updated");
    } else {
      await createReplaySession({
        ...sessionData,
        name: `${index} — ${new Date().toLocaleDateString()}`,
      });
      toast.success("Session saved");
    }
    setSavingSession(false);
  };
  // ─── Complete research session ────────────────────────────────────────────
  const completeSession = () => {
    if (!sessionId || !activeSession) return;
    if (failedTradeSaves.length > 0) {
      toast.error(
        `${failedTradeSaves.length} trade(s) in this session failed to save and won't appear ` +
        `in your Journal. Retry them before completing, or your stats will be inaccurate.`,
        { duration: 10000 }
      );
      return;
    }
    setShowReflection(true);
  };
  const handleReflectionComplete = async (reflection) => {
    const drawings = objects.filter(o => o.type !== "position");
    const stats = computeReplayStats(replayTrades);
    await updateReplaySession(sessionId, {
      status: "completed",
      completed_at: new Date().toISOString(),
      completed: true,
      drawings,
      visible_count: visibleCount,
      conclusion: reflection.conclusion,
      notes: reflection.notes,
      session_trades: replayTrades.map(t => ({
        direction: t.direction, entry: t.entry, sl: t.sl, tp: t.tp,
        state: t.state, result: t.result, rr: t.rr, profitLoss: t.profitLoss,
      })),
      stats: { trades: stats.total, wins: stats.wins, winRate: stats.winRate, totalPL: stats.totalPL },
    });
    trackLifecycleEvent("REPLAY_COMPLETED", { strategy: activeSession?.strategy_name });
    // First replay completed event
try {

  const me = await getCurrentUser();

  if (me?.id) {

    const completedSessions =
      await listReplaySessions({
        status: "completed",
      });

    if (completedSessions.length <= 1) {

      trackLifecycleEvent(
        "FIRST_REPLAY_COMPLETED",
        {
          strategy: activeSession?.strategy_name,
        }
      );

    }

  }

} catch (err) {

  console.error(
    "FIRST_REPLAY_COMPLETED check failed:",
    err?.message || err
  );

}
    queryClient.invalidateQueries({ queryKey: ["trades"] });
    queryClient.invalidateQueries({ queryKey: ["replaySessions"] });
    setShowReflection(false);
    window.location.href = "/backtest";
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.style.cursor = activeTool !== "select" ? "crosshair" : "default";
  }, [activeTool]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => scheduleRender());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [scheduleRender]);
  // ─── Derived values ───────────────────────────────────────────────────────
  const currentPrice = replayCandles[replayCandles.length - 1]?.close;
  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={cn(
      "flex flex-col bg-background transition-all duration-300",
      focusMode
        ? "fixed inset-0 z-50"
        : isMobile
          ? "h-[100dvh] max-h-[100dvh]"
          : "h-[calc(100vh-0px)] max-h-screen"
    )}>
      {/* Header */}
      <ReplayHeader
        index={index}
        granularity={granularity}
        onIndexChange={v => setIndex(v)}
        onGranularityChange={v => setGranularity(v)}
        playing={playing}
        sessionId={sessionCounter}
        loading={loading}
        onRefresh={handleRefresh}
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode(p => !p)}
        onOpenSettings={() => setSettingsOpen(p => !p)}
      />
      {/* Research Session Bar */}
      {activeSession && (
        <SessionBar
          session={activeSession}
          stats={computeReplayStats(replayTrades)}
          tradeCount={replayTrades.length}
          onComplete={completeSession}
          onExit={() => (window.location.href = "/backtest")}
        />
      )}
      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-3 bg-destructive/10 border-b border-destructive/20 text-xs">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
          <span className="text-destructive">{error}</span>
          <Button size="sm" variant="outline" className="ml-auto h-6 text-xs gap-1" onClick={handleRefresh}>
            <RefreshCw className="w-3 h-3" /> Retry
          </Button>
        </div>
      )}
      {/* Loading state */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading {index}…</p>
          </div>
        </div>
      )}
      {/* Main chart workspace */}
      {!loading && candles.length > 0 && (
        <div className="flex-1 relative overflow-hidden min-h-0">
          {/* Canvas fills the workspace */}
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDblClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleCanvasMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
          {/* Floating vertical toolbar — left side */}
          <FloatingToolbar
            activeTool={activeTool}
            onToolChange={t => { setActiveTool(t); setGhost(null); }}
            onClearAll={() => { setObjects([]); setGhost(null); }}
            drawingCount={objects.length}
            isMobile={isMobile}
          />
          {/* Trade drawer — top-right overlay */}
          <TradeDrawer
            direction={direction} setDirection={setDirection}
            entryPrice={entryPrice} setEntryPrice={setEntryPrice}
            sl={sl} setSl={setSl}
            tp={tp} setTp={setTp}
            currentPrice={currentPrice}
            activeTrade={activeTrade}
            onPlaceTrade={placeTrade}
            trades={trades}
            isPro={isPro}
            onSaveSession={saveSession}
            savingSession={savingSession}
            replayStats={computeReplayStats(replayTrades)}
            isMobile={isMobile}
          />
          {/* Free candle limit banner */}
          {!isPro && candles.length > FREE_CANDLE_LIMIT && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 rounded-xl bg-background/90 border border-warning/40 text-xs text-warning font-medium shadow-lg pointer-events-auto">
              <Lock className="w-3.5 h-3.5" />
              Free plan: {FREE_CANDLE_LIMIT} candles max.{" "}
              <Link to="/upgrade" className="underline">Upgrade for full history</Link>
            </div>
          )}
          {/* Top-left controls overlay */}
          <div className="absolute top-2 left-12 z-20 flex items-center gap-2">
            {/* Focus mode toggle */}
            <button
              onClick={() => setFocusMode(p => !p)}
              title={focusMode ? "Exit Focus [Esc]" : "Focus Mode [F]"}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-card/80 backdrop-blur-sm border border-border hover:bg-card transition-all"
            >
              {focusMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{focusMode ? "Exit Focus" : "Focus"}</span>
            </button>

            {/* Date Range Picker */}
            <DateRangePicker onApply={handleDateRangeApply} disabled={loading} />
          </div>
          {/* Chart Settings Drawer */}
          <ChartSettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={chartSettings}
            onUpdate={updateChartSettings}
            activeIndicators={activeIndicators}
            onIndicatorsChange={setActiveIndicators}
          />
          {/* Floating zoom controls — bottom right */}
          <FloatingZoomControls
            onZoomIn={() => setZoomWindow(p => Math.max(MIN_VISIBLE, p - Math.max(3, Math.round(p * 0.12))))}
            onZoomOut={() => setZoomWindow(p => Math.min(candles.length || MAX_VISIBLE_CAP, p + Math.max(3, Math.round(p * 0.12))))}
            onReset={() => { setZoomWindow(DEFAULT_VISIBLE); setVScale(1.0); }}
            onFitAll={() => setZoomWindow(candles.length)}
          />
          {/* Text label editor overlay */}
          {editingText && (
            <div className="absolute z-30" style={{ left: editingText.x, top: editingText.y - 20 }}>
              <input
                autoFocus
                placeholder="Type label…"
                className="bg-card border border-primary text-foreground text-xs px-2 py-1 rounded outline-none min-w-[100px] font-mono shadow-lg"
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" || e.key === "Escape") {
                    const val = e.target.value.trim() || "Note";
                    setObjects(prev => prev.map(o => o.id === editingText.id ? { ...o, label: val } : o));
                    setEditingText(null);
                    setActiveTool("select");
                  }
                }}
                onBlur={(e) => {
                  const val = e.target.value.trim() || "Note";
                  setObjects(prev => prev.map(o => o.id === editingText.id ? { ...o, label: val } : o));
                  setEditingText(null);
                }}
              />
            </div>
          )}
          {/* Active tool hint tooltip */}
          {(activeTool === "long" || activeTool === "short") && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/96 backdrop-blur-sm border border-border rounded-xl shadow-xl px-4 py-2 text-xs z-20 flex items-center gap-2 pointer-events-none">
              <span className={cn("font-bold", activeTool === "long" ? "text-success" : "text-destructive")}>
                {activeTool === "long" ? "↑ LONG" : "↓ SHORT"}
              </span>
              <span className="text-muted-foreground">Click chart to place order · waits for price to touch entry</span>
            </div>
          )}
        </div>
      )}
      {/* Bottom replay bar */}
      {!loading && candles.length > 0 && (
        <ReplayBottomBar
          playing={playing}
          onTogglePlay={() => setPlaying(p => !p)}
          visibleCount={visibleCount}
          totalCount={candles.length}
          onStepBack={stepBack}
          onStepForward={stepForward}
          onSkipBack10={skipBack10}
          onSkipForward10={skipForward10}
          speed={speed}
          onSpeedChange={setSpeed}
          currentPrice={currentPrice}
          trades={trades}
          replayStats={computeReplayStats(replayTrades)}
        />
      )}
      {/* Session Reflection Modal */}
      <SessionReflectionModal
        open={showReflection}
        session={activeSession}
        onClose={() => setShowReflection(false)}
        onComplete={handleReflectionComplete}
      />
    </div>
  );
}
