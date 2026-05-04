import { analyzeAndDecide, type EngineOutput, type EconomicEvent } from '@/lib/analysis/engine';
import { fetchAccountSnapshot, fetchCandles, fetchMarketSnapshot, fetchSymbolSpec, placeMarketOrder } from '@/lib/broker/metaapi';
import { fetchHighImpactEconomicEvents } from '@/lib/sources/economic-calendar';
import { computeSentiment } from '@/lib/sentiment/pipeline';
import { insertBotRun, insertTrade } from '@/lib/db/supabase';
import { env } from '@/lib/env';

export type AnalyzeMarketResult = {
  symbol: string;
  timeframe: string;
  decision: EngineOutput;
  events: EconomicEvent[];
  sentiment: { score: number; sources: string[]; rationale: string; keywords: string[] };
};

export async function analyzeMarket(args: { symbol: string; timeframe: string }): Promise<AnalyzeMarketResult> {
  const e = env();
  const symbol = args.symbol;
  const timeframe = args.timeframe;

  const [spec, market, candles, account] = await Promise.all([
    fetchSymbolSpec(symbol),
    fetchMarketSnapshot(symbol),
    fetchCandles({ symbol, timeframe: timeframe as any, lookbackCandles: 300 }),
    fetchAccountSnapshot(),
  ]);

  const nowMs = Date.now();
  const fromIso = new Date(nowMs - e.BOT_NEWS_LOCK_MINUTES * 60_000).toISOString();
  const toIso = new Date(nowMs + e.BOT_NEWS_LOCK_MINUTES * 60_000).toISOString();
  const currencies = symbol.length >= 6 ? [symbol.slice(0, 3), symbol.slice(3, 6)] : undefined;
  const events = await fetchHighImpactEconomicEvents({ currencies, fromIso, toIso });

  const sentiment = await computeSentiment({
    symbol,
    query: `${symbol} OR forex OR usd OR rates`,
  });

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
      riskPctPerTrade: e.BOT_RISK_PCT,
      atrSlMult: e.BOT_ATR_SL_MULT,
      atrTpMult: e.BOT_ATR_TP_MULT,
      newsLockWindowMinutes: e.BOT_NEWS_LOCK_MINUTES,
    },
  });

  return {
    symbol,
    timeframe,
    decision,
    events,
    sentiment: { score: sentiment.score, sources: sentiment.sources, rationale: sentiment.rationale, keywords: sentiment.keywords },
  };
}

export async function runBotOnce(args: { symbol: string; timeframe: string }) {
  const e = env();
  const mode = e.BOT_EXECUTION_MODE;

  const analyzed = await analyzeMarket(args);
  const { decision, symbol, timeframe } = analyzed;

  const run = await insertBotRun({
    symbol,
    timeframe,
    signal: decision.signal,
    confidence: decision.confidence,
    locked: decision.locked,
    totalScore: decision.reportJson.scores.total,
    report: decision.reportJson,
  });

  const risk = decision.reportJson.risk;
  if (decision.signal === 'WAIT' || !risk?.lotSize) {
    return { mode, runId: run.id, executed: false, analyzed };
  }

  const explanation = `Би яг одоо ${decision.reportText.replace(/\n/g, ' | ')} учир арилжаа нээлээ`;

  if (mode !== 'live') {
    await insertTrade({
      symbol,
      side: decision.signal,
      lot: risk.lotSize,
      stop_loss: risk.stopLoss,
      take_profit: risk.takeProfit,
      status: 'SKIPPED',
      meta: {
        runId: run.id,
        reason: 'BOT_EXECUTION_MODE=dry_run',
        explanation,
        sentiment: { rationale: analyzed.sentiment.rationale, keywords: analyzed.sentiment.keywords },
      },
    });
    return { mode, runId: run.id, executed: false, analyzed, explanation };
  }

  const placed = await placeMarketOrder({
    symbol,
    side: decision.signal,
    lot: risk.lotSize,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    comment: `MFA-XAI run=${run.id}`,
  });

  await insertTrade({
    symbol,
    side: decision.signal,
    lot: risk.lotSize,
    stop_loss: risk.stopLoss,
    take_profit: risk.takeProfit,
    broker_order_id: placed.orderId,
    broker_position_id: placed.positionId,
    status: 'PLACED',
    meta: {
      runId: run.id,
      explanation,
      broker: placed.broker,
      sentiment: { rationale: analyzed.sentiment.rationale, keywords: analyzed.sentiment.keywords },
    },
  });

  return { mode, runId: run.id, executed: true, analyzed, explanation, broker: placed };
}

