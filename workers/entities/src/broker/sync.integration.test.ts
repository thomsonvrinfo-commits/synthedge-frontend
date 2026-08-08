import { describe, it, expect } from "vitest";
import { mapDerivTransactionsToTrades, mapMt5DealsToTrades } from "./sync";

const CONN = { created_by_id: "user_1", account_id: "CR123456", account_type: "live" as const };

describe("mapDerivTransactionsToTrades", () => {
  it("maps a winning CALL contract", () => {
    const [trade] = mapDerivTransactionsToTrades(
      [
        {
          contract_id: 987654321,
          purchase_time: 1700000000,
          sell_time: 1700000300,
          profit: 4.5,
          contract_type: "CALL",
          underlying: "R_10",
          entry_spot: 6543.21,
          exit_tick: 6550.0,
          currency: "USD",
        },
      ],
      CONN
    );
    expect(trade).toMatchObject({
      broker: "deriv",
      broker_trade_id: "987654321",
      symbol: "R_10",
      side: "buy",
      entry_price: 6543.21,
      exit_price: 6550.0,
      pnl: 4.5,
      result: "win",
      duration_seconds: 300,
      currency: "USD",
    });
    expect(trade!.opened_at).toBe(new Date(1700000000 * 1000).toISOString());
    expect(trade!.closed_at).toBe(new Date(1700000300 * 1000).toISOString());
  });

  it("maps a losing PUT contract to side='sell' and result='loss'", () => {
    const [trade] = mapDerivTransactionsToTrades(
      [{ contract_id: 1, purchase_time: 100, sell_time: 200, profit: -2, contract_type: "PUT", underlying: "R_50" }],
      CONN
    );
    expect(trade!.side).toBe("sell");
    expect(trade!.result).toBe("loss");
  });

  it("treats exactly-zero profit as breakeven", () => {
    const [trade] = mapDerivTransactionsToTrades([{ contract_id: 1, profit: 0, contract_type: "CALL" }], CONN);
    expect(trade!.result).toBe("breakeven");
  });

  it("falls back transaction_id -> id, shortcode -> symbol, purchase/sell_price -> prices when primary fields are absent", () => {
    const [trade] = mapDerivTransactionsToTrades(
      [{ transaction_id: 555, profit: 1, contract_type: "CALL", shortcode: "CALL_R_75_10_...", purchase: 100, sell_price: 110 }],
      CONN
    );
    expect(trade!.broker_trade_id).toBe("555");
    expect(trade!.symbol).toBe("CALL_R_75_10_...");
    expect(trade!.entry_price).toBe(100);
    expect(trade!.exit_price).toBe(110);
  });

  it("carries account_id/account_type/created_by_id from the connection, not the transaction", () => {
    const [trade] = mapDerivTransactionsToTrades([{ contract_id: 1, profit: 1, contract_type: "CALL" }], CONN);
    expect(trade!.created_by_id).toBe(CONN.created_by_id);
    expect(trade!.account_id).toBe(CONN.account_id);
    expect(trade!.account_type).toBe(CONN.account_type);
  });
});

describe("mapMt5DealsToTrades", () => {
  it("pairs an IN and OUT deal on the same positionId into one closed trade", () => {
    const trades = mapMt5DealsToTrades(
      [
        { positionId: "pos1", entryType: "DEAL_ENTRY_IN", type: "DEAL_TYPE_BUY", time: "2024-01-01T00:00:00Z", volume: 0.1, price: 1.1, symbol: "EURUSD" },
        { positionId: "pos1", entryType: "DEAL_ENTRY_OUT", time: "2024-01-01T01:00:00Z", price: 1.105, profit: 50, commission: -2, swap: -0.5 },
      ],
      CONN
    );
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      broker: "mt5_exness",
      broker_trade_id: "pos1",
      symbol: "EURUSD",
      side: "buy",
      volume: 0.1,
      entry_price: 1.1,
      exit_price: 1.105,
      pnl: 50,
      fees: -2,
      swap: -0.5,
      result: "win",
      duration_seconds: 3600,
    });
  });

  it("classifies a SELL type as side='sell'", () => {
    const trades = mapMt5DealsToTrades(
      [{ positionId: "pos2", entryType: "DEAL_ENTRY_IN", type: "DEAL_TYPE_SELL", time: "2024-01-01T00:00:00Z", profit: -10 }],
      CONN
    );
    expect(trades[0]!.side).toBe("sell");
    expect(trades[0]!.result).toBe("loss");
  });

  it("groups multiple deals under one position (e.g. partial closes) into a single trade summing fees/swap", () => {
    const trades = mapMt5DealsToTrades(
      [
        { positionId: "pos3", entryType: "DEAL_ENTRY_IN", type: "DEAL_TYPE_BUY", time: "2024-01-01T00:00:00Z" },
        { positionId: "pos3", entryType: "DEAL_ENTRY_OUT", time: "2024-01-01T00:30:00Z", profit: 20, commission: -1, swap: 0 },
        { positionId: "pos3", entryType: "DEAL_ENTRY_OUT", time: "2024-01-01T01:00:00Z", profit: 10, commission: -1, swap: 0 },
      ],
      CONN
    );
    expect(trades).toHaveLength(1);
    // fees summed across all deals in the group
    expect(trades[0]!.fees).toBe(-2);
  });

  it("falls back to id when positionId is absent, and to the first deal when no in/out entryType matches", () => {
    const trades = mapMt5DealsToTrades([{ id: "deal-xyz", symbol: "GBPUSD", profit: 5 }], CONN);
    expect(trades).toHaveLength(1);
    expect(trades[0]!.broker_trade_id).toBe("deal-xyz");
    expect(trades[0]!.symbol).toBe("GBPUSD");
  });

  it("skips deals with neither positionId nor id", () => {
    const trades = mapMt5DealsToTrades([{ profit: 5 }], CONN);
    expect(trades).toHaveLength(0);
  });
});
