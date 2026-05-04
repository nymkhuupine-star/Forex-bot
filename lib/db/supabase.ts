import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { XaiReport } from '@/lib/analysis/engine';

export type BotRunRecord = {
  id: string;
  created_at: string;
  symbol: string;
  timeframe: string;
  signal: string;
  confidence: number;
  locked: boolean;
  total_score: number;
  report: XaiReport;
};

export type TradeRecord = {
  id: string;
  created_at: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  lot: number;
  entry_price?: number;
  stop_loss: number;
  take_profit: number;
  broker_order_id?: string;
  broker_position_id?: string;
  status: 'PLACED' | 'REJECTED' | 'SKIPPED';
  meta?: Record<string, unknown>;
};

let cached: any;

function supabase() {
  if (cached) return cached;
  const e = env();
  // Using `any` until you generate proper Supabase types for your project.
  cached = createClient(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export async function insertBotRun(args: {
  symbol: string;
  timeframe: string;
  signal: string;
  confidence: number;
  locked: boolean;
  totalScore: number;
  report: XaiReport;
}) {
  const s = supabase();
  const { data, error } = await s
    .from('bot_runs')
    .insert({
      symbol: args.symbol,
      timeframe: args.timeframe,
      signal: args.signal,
      confidence: args.confidence,
      locked: args.locked,
      total_score: args.totalScore,
      report: args.report,
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert bot_runs failed: ${error.message}`);
  return data as BotRunRecord;
}

export async function insertTrade(args: Omit<TradeRecord, 'id' | 'created_at'>) {
  const s = supabase();
  const { data, error } = await s.from('trades').insert(args).select().single();
  if (error) throw new Error(`Supabase insert trades failed: ${error.message}`);
  return data as TradeRecord;
}

export async function fetchLatestBotRun(symbol: string) {
  const s = supabase();
  const { data, error } = await s
    .from('bot_runs')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Supabase fetch bot_runs failed: ${error.message}`);
  return (data ?? null) as BotRunRecord | null;
}

export type BotSettings = {
  id: string;
  enabled: boolean;
  risk_pct: number;
  updated_at: string;
};

export async function getBotSettings(): Promise<BotSettings> {
  const s = supabase();
  const { data, error } = await s.from('bot_settings').select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(`Supabase fetch bot_settings failed: ${error.message}`);
  if (data) return data as BotSettings;

  const { data: created, error: insErr } = await s
    .from('bot_settings')
    .insert({ enabled: false, risk_pct: 0.01, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (insErr) throw new Error(`Supabase insert bot_settings failed: ${insErr.message}`);
  return created as BotSettings;
}

export async function updateBotSettings(patch: Partial<Pick<BotSettings, 'enabled' | 'risk_pct'>>): Promise<BotSettings> {
  const s = supabase();
  const current = await getBotSettings();
  const { data, error } = await s
    .from('bot_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .select()
    .single();
  if (error) throw new Error(`Supabase update bot_settings failed: ${error.message}`);
  return data as BotSettings;
}

export async function fetchRecentTrades(args: { symbol?: string; limit: number }) {
  const s = supabase();
  let q = s.from('trades').select('*').order('created_at', { ascending: false }).limit(args.limit);
  if (args.symbol) q = q.eq('symbol', args.symbol);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase fetch trades failed: ${error.message}`);
  return (data ?? []) as TradeRecord[];
}
