-- Minimal schema for the institutional-style bot.
-- Apply in Supabase SQL editor.

create table if not exists public.bot_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  symbol text not null,
  timeframe text not null,
  signal text not null,
  confidence double precision not null,
  locked boolean not null,
  total_score double precision not null,
  report jsonb not null
);

create index if not exists bot_runs_symbol_created_at_idx
  on public.bot_runs (symbol, created_at desc);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  symbol text not null,
  side text not null check (side in ('BUY','SELL')),
  lot double precision not null,
  entry_price double precision,
  stop_loss double precision not null,
  take_profit double precision not null,
  broker_order_id text,
  broker_position_id text,
  status text not null check (status in ('PLACED','REJECTED','SKIPPED')),
  meta jsonb
);

create index if not exists trades_symbol_created_at_idx
  on public.trades (symbol, created_at desc);

create table if not exists public.bot_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enabled boolean not null default false,
  risk_pct double precision not null default 0.01
);

-- Singleton row pattern (optional): keep one row only by inserting once and updating it.
