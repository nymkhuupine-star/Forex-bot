import { env } from '@/lib/env';
import { fetchCandles, type Timeframe } from '@/lib/broker/metaapi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const e = env();
  const url = new URL(req.url);
  const symbol = url.searchParams.get('symbol') ?? e.BOT_SYMBOLS.split(',')[0]?.trim() ?? 'EURUSD';
  const timeframe = (url.searchParams.get('timeframe') ?? e.BOT_TIMEFRAME) as Timeframe;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '300'), 1000);

  const candles = await fetchCandles({ symbol, timeframe, lookbackCandles: limit });
  const out = candles.map((c) => ({
    time: Math.floor(Date.parse(c.time) / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

  return Response.json({ ok: true, symbol, timeframe, candles: out });
}

