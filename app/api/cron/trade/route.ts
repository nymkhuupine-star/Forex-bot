import { analyzeAndDecide } from '@/lib/analysis/engine';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { fetchAccountSnapshot, fetchCandles, fetchMarketSnapshot, fetchSymbolSpec, placeMarketOrder, type Timeframe } from '@/lib/broker/metaapi';
import { getBotSettings, insertBotRun, insertTrade } from '@/lib/db/supabase';
import { computeSentiment } from '@/lib/sentiment/pipeline';
import { fetchHighImpactEconomicEvents } from '@/lib/sources/economic-calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

/**
 * Vercel Cron entrypoint (run every minute).
 *
 * Real minute loop:
 * - Pull candles + prices + account from MetaApi (MT5 via XM)
 * - Compute sentiment (NewsAPI + Twitter -> AI SDK)
 * - Run confluence decision engine (technical + fundamental + sentiment)
 * - Persist XAI report to Supabase
 * - Execute trade (default dry_run; live only with BOT_EXECUTION_MODE=live)
 */
export async function GET(req: Request) {
  const e = env();
  const secret = e.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (token !== secret) return unauthorized();
  }

  const timeframe = e.BOT_TIMEFRAME as Timeframe;
  const symbols = e.BOT_SYMBOLS.split(',').map((s) => s.trim()).filter(Boolean);
  const mode = e.BOT_EXECUTION_MODE;

  const results: any[] = [];
  const settings = await getBotSettings();
  const account = await fetchAccountSnapshot();

  for (const symbol of symbols) {
    try {
      const [spec, market, candles] = await Promise.all([
        fetchSymbolSpec(symbol),
        fetchMarketSnapshot(symbol),
        fetchCandles({ symbol, timeframe, lookbackCandles: 300 }),
      ]);

      // Fundamental: Economic calendar (HIGH impact) around now (± lock window).
      const nowMs = Date.now();
      const fromIso = new Date(nowMs - e.BOT_NEWS_LOCK_MINUTES * 60_000).toISOString();
      const toIso = new Date(nowMs + e.BOT_NEWS_LOCK_MINUTES * 60_000).toISOString();
      const currencies = symbol.length >= 6 ? [symbol.slice(0, 3), symbol.slice(3, 6)] : undefined;
      const events = await fetchHighImpactEconomicEvents({ currencies, fromIso, toIso });

      // Sentiment query heuristic (tune per symbol)
      const sentiment = await computeSentiment({
        symbol,
        query: `${symbol} OR forex OR usd OR rates`,
      });

      // Fundamental calendar integration is broker-agnostic; keep as empty until wired.
      const decision = analyzeAndDecide({
        instrument: spec,
        account,
        candles,
        market,
        fundamental: { events },
        sentiment: { score: sentiment.score, sources: sentiment.sources },
        config: {
          tradeThreshold: e.BOT_TRADE_THRESHOLD,
          spreadAtrPenaltyThreshold: e.BOT_MAX_SPREAD_ATR_FRAC,
          riskPctPerTrade: settings.risk_pct ?? e.BOT_RISK_PCT,
          atrSlMult: e.BOT_ATR_SL_MULT,
          atrTpMult: e.BOT_ATR_TP_MULT,
          newsLockWindowMinutes: e.BOT_NEWS_LOCK_MINUTES,
        },
      });

      const run = await insertBotRun({
        symbol,
        timeframe,
        signal: decision.signal,
        confidence: decision.confidence,
        locked: decision.locked,
        totalScore: decision.reportJson.scores.total,
        report: decision.reportJson,
      });

      let execution: any = { mode, status: 'SKIPPED' };
      if (!settings.enabled) {
        execution = { mode, status: 'SKIPPED', reason: 'bot_disabled' };
      } else if (decision.signal !== 'WAIT' && decision.reportJson.risk && decision.reportJson.risk.lotSize !== undefined) {
        const risk = decision.reportJson.risk;
        const lot = risk.lotSize!;
        const explanation = `Би яг одоо ${decision.reportText.replace(/\n/g, ' | ')} учир арилжаа нээлээ`;

        if (mode === 'live') {
          const placed = await placeMarketOrder({
            symbol,
            side: decision.signal,
            lot,
            stopLoss: risk.stopLoss,
            takeProfit: risk.takeProfit,
            comment: `MFA-XAI run=${run.id}`,
          });

          await insertTrade({
            symbol,
            side: decision.signal,
            lot,
            entry_price: (market.bid + market.ask) / 2,
            stop_loss: risk.stopLoss,
            take_profit: risk.takeProfit,
            broker_order_id: placed.orderId,
            broker_position_id: placed.positionId,
            status: 'PLACED',
            meta: {
              runId: run.id,
              broker: placed.broker,
              explanation,
              sentiment: { rationale: sentiment.rationale, keywords: sentiment.keywords },
            },
          });

          execution = { mode, status: 'PLACED', broker: placed };
        } else {
          await insertTrade({
            symbol,
            side: decision.signal,
            lot,
            entry_price: (market.bid + market.ask) / 2,
            stop_loss: risk.stopLoss,
            take_profit: risk.takeProfit,
            status: 'SKIPPED',
            meta: {
              runId: run.id,
              reason: 'BOT_EXECUTION_MODE=dry_run',
              explanation,
              sentiment: { rationale: sentiment.rationale, keywords: sentiment.keywords },
            },
          });
          execution = { mode, status: 'SKIPPED', reason: 'dry_run' };
        }
      }

      results.push({
        symbol,
        timeframe,
        signal: decision.signal,
        confidence: decision.confidence,
        locked: decision.locked,
        totalScore: decision.reportJson.scores.total,
        runId: run.id,
        execution,
      });
    } catch (err: any) {
      logger.error({ symbol, err }, 'Cron loop error');
      results.push({ symbol, timeframe, ok: false, error: String(err?.message ?? err) });
    }
  }

  return Response.json({ ok: true, mode, results, account, settings });
}
