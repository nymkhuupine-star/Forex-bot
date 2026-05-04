import { env } from '@/lib/env';
import { fetchAccountSnapshot } from '@/lib/broker/metaapi';
import { fetchRecentTrades, fetchLatestBotRun, getBotSettings } from '@/lib/db/supabase';
import { fetchHighImpactEconomicEvents } from '@/lib/sources/economic-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const e = env();
  const symbols = e.BOT_SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean);
  const symbol = symbols[0] ?? 'EURUSD';

  const account = await fetchAccountSnapshot();
  const settings = await getBotSettings();
  const lastRun = await fetchLatestBotRun(symbol);
  const trades = await fetchRecentTrades({ symbol, limit: 25 });

  const nowMs = Date.now();
  const fromIso = new Date(nowMs).toISOString();
  const toIso = new Date(nowMs + 24 * 60 * 60_000).toISOString();
  const currencies = symbol.length >= 6 ? [symbol.slice(0, 3), symbol.slice(3, 6)] : undefined;
  const events24h = await fetchHighImpactEconomicEvents({ currencies, fromIso, toIso });

  return Response.json({
    ok: true,
    symbol,
    timeframe: e.BOT_TIMEFRAME,
    mode: e.BOT_EXECUTION_MODE,
    account,
    settings,
    lastRun,
    trades,
    events24h,
  });
}

