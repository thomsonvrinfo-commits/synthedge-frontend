-- SynthEdge D1 schema — initial migration
-- Source: Migration Master Plan Volume 2, Phase 3, Section 3.1, generated from
-- the verified base44/entities/*.jsonc definitions in the discovery report.
-- Convention: id = ULID (26-char, sortable), created_by_id references users(id),
-- created_date/updated_date = ISO 8601 text, matching current "-created_date" sort usage.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id                       TEXT PRIMARY KEY,
  email                    TEXT NOT NULL UNIQUE,
  password_hash            TEXT,                 -- NULL for Google-only or pre-migration accounts pending forced reset
  full_name                TEXT,
  role                     TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  plan                     TEXT NOT NULL DEFAULT 'FREE' CHECK (plan IN ('FREE','EARLY_ACCESS')),
  subscription_status      TEXT NOT NULL DEFAULT 'TRIAL' CHECK (subscription_status IN ('TRIAL','ACTIVE','EXPIRED','CANCELLED')),
  trial_start_date         TEXT,
  trial_end_date           TEXT,
  subscription_start_date  TEXT,
  subscription_end_date    TEXT,
  payment_provider         TEXT CHECK (payment_provider IN ('paynow','stripe','ecocash','manual')),
  paynow_reference         TEXT,
  last_payment_date        TEXT,
  next_billing_date        TEXT,
  created_date              TEXT NOT NULL,
  updated_date               TEXT NOT NULL
);

CREATE TABLE refresh_tokens (
  id                TEXT PRIMARY KEY,               -- ULID
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash          TEXT NOT NULL UNIQUE,          -- SHA-256 hash of the raw refresh token; raw value never stored
  issued_at             TEXT NOT NULL,
  expires_at             TEXT NOT NULL,
  revoked_at              TEXT,                       -- set on rotation-supersede or explicit logout
  replaced_by_token_id     TEXT REFERENCES refresh_tokens(id),
  user_agent                 TEXT,
  ip_hint                      TEXT
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE otp_codes (
  id            TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash       TEXT NOT NULL,   -- SHA-256 of the OTP, never stored raw
  purpose          TEXT NOT NULL CHECK (purpose IN ('signup_verify','password_reset')),
  expires_at         TEXT NOT NULL,
  consumed_at          TEXT,
  attempts               INTEGER NOT NULL DEFAULT 0,
  created_date             TEXT NOT NULL
);
CREATE INDEX idx_otp_codes_user_purpose ON otp_codes(user_id, purpose);

CREATE TABLE trader_profiles (
  id                    TEXT PRIMARY KEY,
  created_by_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name             TEXT,
  goals                       TEXT,   -- JSON array
  custom_strategies             TEXT, -- JSON array
  custom_fields                   TEXT, -- JSON array of {id,label,type,options}
  dashboard_widgets                 TEXT, -- JSON array
  account_size                        REAL,
  risk_per_trade                        REAL,
  max_daily_trades                        INTEGER,
  preferred_sessions                        TEXT, -- JSON array
  preferred_indices                           TEXT, -- JSON array
  timezone                                      TEXT,
  subscription_plan                               TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_plan IN ('trial','pro','free')),
  trial_end_date                                    TEXT,
  created_date                                        TEXT NOT NULL,
  updated_date                                          TEXT NOT NULL
);
CREATE INDEX idx_trader_profiles_owner ON trader_profiles(created_by_id);

CREATE TABLE user_subscriptions (
  id             TEXT PRIMARY KEY,
  created_by_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan             TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','pro')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','pending')),
  role               TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','developer','admin')),
  billing_cycle       TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly','lifetime')),
  started_at            TEXT,
  expires_at              TEXT,
  payment_method            TEXT CHECK (payment_method IN ('stripe','ecocash','paynow','free')),
  created_date                TEXT NOT NULL,
  updated_date                  TEXT NOT NULL
);
CREATE INDEX idx_user_subscriptions_owner ON user_subscriptions(created_by_id);
CREATE INDEX idx_user_subscriptions_expiry ON user_subscriptions(status, expires_at);

CREATE TABLE payment_records (
  id                       TEXT PRIMARY KEY,
  created_by_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount                     REAL NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'USD',
  method                        TEXT NOT NULL CHECK (method IN ('stripe','ecocash','paynow','free')),
  transaction_reference           TEXT,
  status                            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  plan                                TEXT NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro')),
  billing_cycle                         TEXT CHECK (billing_cycle IN ('monthly','annual')),
  notes                                    TEXT,
  poll_url                                   TEXT,
  reviewed_at                                  TEXT,
  created_date                                   TEXT NOT NULL,
  updated_date                                     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_payment_records_reference ON payment_records(transaction_reference);
CREATE INDEX idx_payment_records_owner ON payment_records(created_by_id);

CREATE TABLE payment_audit_log (
  id             TEXT PRIMARY KEY,
  payment_record_id  TEXT NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  event               TEXT NOT NULL CHECK (event IN ('created','webhook_received','poll_attempted','activated','rejected')),
  actor                  TEXT NOT NULL CHECK (actor IN ('webhook','poll','manual','system')),
  detail                    TEXT,  -- JSON, redacted (no raw hash/keys)
  created_date                TEXT NOT NULL
);
CREATE INDEX idx_payment_audit_log_record ON payment_audit_log(payment_record_id, created_date);

CREATE TABLE trades (
  id                    TEXT PRIMARY KEY,
  created_by_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol                   TEXT,
  synthetic_index            TEXT,   -- legacy, preserved
  direction                    TEXT NOT NULL CHECK (direction IN ('Buy','Sell')),
  entry_price                    REAL NOT NULL,
  exit_price                       REAL,
  stop_loss                          REAL,
  take_profit                          REAL,
  lot_size                               REAL,
  stake                                    REAL,
  rr                                         REAL,
  risk_reward_ratio                            REAL,   -- legacy, preserved
  result                                         TEXT NOT NULL CHECK (result IN ('Win','Loss','Breakeven')),
  pl                                               REAL,
  profit_loss                                        REAL,   -- legacy, preserved
  setup                                                TEXT,
  strategy                                               TEXT,   -- legacy, preserved
  emotional_state                                          TEXT CHECK (emotional_state IN ('Calm','Confident','Anxious','FOMO','Revenge','Frustrated','Excited','Neutral','Fearful','Overconfident')),
  confidence_level                                           INTEGER,
  session                                                      TEXT CHECK (session IN ('London','New York','Asian','Sydney','Overlap')),
  trade_date                                                     TEXT,   -- legacy, preserved; canonical is created_date
  notes                                                            TEXT,
  trade_reasoning                                                    TEXT,
  market_conditions                                                    TEXT,
  mistakes_made                                                          TEXT,
  lessons_learned                                                          TEXT,
  execution_rating                                                          INTEGER,
  rule_violations                                                             TEXT,  -- JSON array
  plan_followed                                                                 TEXT CHECK (plan_followed IN ('Fully','Partially','No')),
  reflection_completed                                                            INTEGER NOT NULL DEFAULT 0,
  dataset                                                                          TEXT NOT NULL DEFAULT 'LIVE' CHECK (dataset IN ('LIVE','BACKTEST')),
  source                                                                            TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','CSV','SCREENSHOT','REPLAY','LONG_SHORT_TOOL','journal','backtest')),
  replay_session_id                                                                   TEXT REFERENCES replay_sessions(id) ON DELETE SET NULL,
  screenshot_url                                                                        TEXT,
  screenshot_before                                                                       TEXT,
  screenshot_during                                                                         TEXT,
  screenshot_after                                                                            TEXT,
  custom_fields                                                                                 TEXT,  -- JSON object
  created_date                                                                                    TEXT NOT NULL,
  updated_date                                                                                       TEXT NOT NULL
);
CREATE INDEX idx_trades_owner ON trades(created_by_id, created_date DESC);
CREATE INDEX idx_trades_replay_session ON trades(replay_session_id);

CREATE TABLE replay_sessions (
  id                 TEXT PRIMARY KEY,
  created_by_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  index_name            TEXT NOT NULL,
  granularity             REAL NOT NULL,
  visible_count             REAL,
  candle_start_epoch          REAL,
  drawings                      TEXT,  -- JSON array
  session_trades                  TEXT,  -- JSON array (denormalized snapshot)
  stats                             TEXT,  -- JSON object
  name                                 TEXT,
  completed                              INTEGER NOT NULL DEFAULT 0,
  objective                                TEXT,
  status                                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  started_at                                   TEXT,
  completed_at                                   TEXT,
  strategy_name                                    TEXT,
  rules_being_tested                                 TEXT,  -- JSON array
  notes                                                TEXT,
  conclusion                                             TEXT,
  created_date                                             TEXT NOT NULL,
  updated_date                                               TEXT NOT NULL
);
CREATE INDEX idx_replay_sessions_owner ON replay_sessions(created_by_id, created_date DESC);

CREATE TABLE trading_rules (
  id                TEXT PRIMARY KEY,
  created_by_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description            TEXT,
  category                 TEXT NOT NULL CHECK (category IN ('Risk Management','Entry Rules','Exit Rules','Session Rules','Psychology','Trade Management')),
  is_active                  INTEGER NOT NULL DEFAULT 1,
  violation_count              INTEGER NOT NULL DEFAULT 0,
  created_date                   TEXT NOT NULL,
  updated_date                     TEXT NOT NULL
);
CREATE INDEX idx_trading_rules_owner ON trading_rules(created_by_id);

CREATE TABLE broker_connections (
  id                    TEXT PRIMARY KEY,
  created_by_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker                    TEXT NOT NULL CHECK (broker IN ('deriv','mt5_exness')),
  account_id                  TEXT NOT NULL,
  account_type                  TEXT NOT NULL CHECK (account_type IN ('live','demo')),
  status                          TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','error','disconnected')),
  last_synced_at                     TEXT,
  connected_at                         TEXT,
  display_name                           TEXT,
  encrypted_token                          TEXT,   -- AES-GCM, base64: iv || ciphertext
  metaapi_account_id                          TEXT,
  server                                        TEXT,
  last_error                                      TEXT,
  created_date                                      TEXT NOT NULL,
  updated_date                                        TEXT NOT NULL,
  UNIQUE (created_by_id, broker, account_id)
);

CREATE TABLE broker_trades (
  id                    TEXT PRIMARY KEY,
  created_by_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  broker                    TEXT NOT NULL CHECK (broker IN ('deriv','mt5_exness')),
  account_id                  TEXT NOT NULL,
  account_type                  TEXT NOT NULL CHECK (account_type IN ('live','demo')),
  broker_trade_id                  TEXT NOT NULL,
  symbol                              TEXT NOT NULL,
  side                                  TEXT NOT NULL CHECK (side IN ('buy','sell')),
  volume                                  REAL,
  entry_price                               REAL,
  exit_price                                  REAL,
  stop_loss                                     REAL,
  take_profit                                     REAL,
  opened_at                                         TEXT,
  closed_at                                           TEXT,
  currency                                              TEXT NOT NULL DEFAULT 'USD',
  pnl                                                     REAL NOT NULL DEFAULT 0,
  fees                                                      REAL NOT NULL DEFAULT 0,
  swap                                                        REAL NOT NULL DEFAULT 0,
  duration_seconds                                              REAL,
  r_multiple                                                      REAL,
  result                                                            TEXT NOT NULL CHECK (result IN ('win','loss','breakeven')),
  emotion_tag                                                         TEXT,
  note                                                                  TEXT,
  raw_payload                                                             TEXT,  -- JSON, audit trail
  created_date                                                              TEXT NOT NULL,
  updated_date                                                                TEXT NOT NULL,
  UNIQUE (broker, account_id, broker_trade_id)
);
CREATE INDEX idx_broker_trades_owner ON broker_trades(created_by_id, created_date DESC);
