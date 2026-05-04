import { z } from 'zod';

export type TradeSignal = 'BUY' | 'SELL' | 'WAIT';

export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type Candle = {
  time: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type EconomicEvent = {
  time: string; // ISO
  title: string;
  currency?: string;
  impact: ImpactLevel;
};

export type InstrumentSpec = {
  symbol: string;
  digits: number;
  point: number; // minimum price increment, e.g. EURUSD 0.00001 on 5 digits
  contractSize?: number; // e.g. 100000 for FX standard lot (optional; broker-specific)
  minLot?: number;
  lotStep?: number;
  maxLot?: number;
  /**
   * How much account currency P&L changes for a 1-point move at 1 lot.
   * If you can fetch it from MetaApi, pass it here for accurate sizing.
   */
  tickValuePerLot?: number;
};

export type AccountSnapshot = {
  equity: number;
  balance?: number;
  currency?: string;
};

export type EngineWeights = {
  technical: number; // default 0.4
  fundamental: number; // default 0.3
  sentiment: number; // default 0.3
};

export type EngineConfig = {
  weights?: Partial<EngineWeights>;
  rsiPeriod?: number; // default 14
  emaFast?: number; // default 50
  emaSlow?: number; // default 200
  atrPeriod?: number; // default 14
  atrSlMult?: number; // default 1.5
  atrTpMult?: number; // default 2.5
  riskPctPerTrade?: number; // default 0.01 (1%)
  /**
   * For "confluence trading": require a minimum combined score magnitude before trading.
   * Range [0..1]. Higher => fewer trades.
   */
  tradeThreshold?: number; // default 0.35
  /**
   * If price is within this spread fraction of ATR, reduce confidence.
   * Range [0..1]. Example: 0.08 means spread > 8% of ATR is considered expensive.
   */
  spreadAtrPenaltyThreshold?: number; // default 0.08
  /**
   * Lock trading within ±newsLockWindowMinutes of HIGH impact events.
   */
  newsLockWindowMinutes?: number; // default 60
  /**
   * Minimum candles required (guardrail). If not met, returns WAIT.
   */
  minCandles?: number; // default 220 (enough for EMA200 + ATR/RSI)
};

export type EngineInput = {
  now?: string; // ISO (defaults to Date.now)
  instrument: InstrumentSpec;
  account: AccountSnapshot;
  candles: Candle[]; // ascending by time
  /**
   * Current executable prices; if omitted, engine uses last candle close as reference.
   */
  market?: { bid?: number; ask?: number };
  fundamental?: { events?: EconomicEvent[] };
  /**
   * Precomputed sentiment score in [-1..1] from an LLM (OpenAI/Anthropic).
   * If omitted, sentiment is treated as neutral (0).
   */
  sentiment?: { score?: number; sources?: string[] };
  config?: EngineConfig;
};

export type TechnicalBreakdown = {
  emaFast: number;
  emaSlow: number;
  emaTrend: 'BULL' | 'BEAR' | 'FLAT';
  emaScore: number; // [-1..1]
  rsi: number;
  rsiRegime: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  rsiScore: number; // [-1..1]
  obvSlope: number;
  obvScore: number; // [-1..1]
  technicalScore: number; // [-1..1]
};

export type FundamentalBreakdown = {
  locked: boolean;
  lockedUntil?: string;
  reasons: string[];
  fundamentalScore: number; // [-1..1] (this module is a filter; score defaults to 0)
};

export type SentimentBreakdown = {
  sentimentScore: number; // [-1..1]
  sources: string[];
};

export type RiskPlan = {
  atr: number;
  referencePrice: number;
  side: 'BUY' | 'SELL';
  stopLoss: number;
  takeProfit: number;
  stopDistancePoints: number;
  riskAmount: number;
  lotSize?: number; // undefined when sizing inputs are insufficient
  sizingNotes: string[];
};

export type XaiReport = {
  version: 1;
  generatedAt: string;
  instrument: InstrumentSpec;
  account: AccountSnapshot;
  inputs: {
    candles: { count: number; from: string; to: string };
    market: { bid?: number; ask?: number };
    economicEvents: { total: number; highImpact: number };
  };
  sentiment: SentimentBreakdown;
  weights: EngineWeights;
  scores: {
    technical: number;
    fundamental: number;
    sentiment: number;
    total: number;
  };
  technical: TechnicalBreakdown;
  fundamental: FundamentalBreakdown;
  decision: {
    signal: TradeSignal;
    confidence: number; // [0..1]
    confluence: {
      alignTechnical: boolean;
      alignSentiment: boolean;
      newsUnlocked: boolean;
      thresholdPassed: boolean;
    };
    notes: string[];
  };
  risk?: RiskPlan;
};

export type EngineOutput = {
  signal: TradeSignal;
  confidence: number;
  locked: boolean;
  reportJson: XaiReport;
  reportText: string;
};

const weightsSchema = z
  .object({
    technical: z.number().min(0).max(1),
    fundamental: z.number().min(0).max(1),
    sentiment: z.number().min(0).max(1),
  })
  .refine((w) => Math.abs(w.technical + w.fundamental + w.sentiment - 1) < 1e-9, {
    message: 'Weights must sum to 1',
  });

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToDigits(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function latest<T>(arr: T[]) {
  return arr[arr.length - 1];
}

function parseIsoMs(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO date: ${iso}`);
  return ms;
}

function isoNow(now?: string) {
  return now ?? new Date().toISOString();
}

function computeObvSlope(obvSeries: number[], lookback = 20) {
  if (obvSeries.length < lookback + 1) return 0;
  const slice = obvSeries.slice(-lookback);
  // simple slope: (last - first) / lookback
  return (slice[slice.length - 1] - slice[0]) / lookback;
}

function ema(values: number[], period: number) {
  if (values.length < period) return [] as number[];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA seed
  out.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rsiWilder(values: number[], period: number) {
  if (values.length < period + 1) return [] as number[];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;

  const out: number[] = [];
  const rs0 = loss === 0 ? 100 : gain / loss;
  out.push(100 - 100 / (1 + rs0));

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    const rs = loss === 0 ? 100 : gain / loss;
    out.push(100 - 100 / (1 + rs));
  }
  return out;
}

function atrWilder(candles: Candle[], period: number) {
  if (candles.length < period + 1) return [] as number[];
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  if (trs.length < period) return [] as number[];
  const out: number[] = [];
  let prev = trs.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA seed
  out.push(prev);
  for (let i = period; i < trs.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out.push(prev);
  }
  return out;
}

function obvSeries(closes: number[], volumes: number[]) {
  const out: number[] = [];
  let obv = 0;
  out.push(obv);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i];
    else if (closes[i] < closes[i - 1]) obv -= volumes[i];
    out.push(obv);
  }
  return out;
}

function scoreEmaTrend(emaFast: number, emaSlow: number) {
  const diff = emaFast - emaSlow;
  const denom = Math.max(Math.abs(emaSlow), 1e-9);
  const rel = diff / denom;
  // scale: 0.1% relative diff => full score
  return clamp(rel / 0.001, -1, 1);
}

function scoreRsi(rsi: number) {
  if (rsi <= 30) return clamp((30 - rsi) / 10, 0, 1); // 30->0 .. 20->1
  if (rsi >= 70) return -clamp((rsi - 70) / 10, 0, 1); // 70->0 .. 80->-1
  // mild regime: center around 50
  return clamp((50 - rsi) / 20, -1, 1);
}

function scoreObvSlope(obvSlope: number, normalizationVolume: number) {
  // normalize OBV slope by typical volume to get a roughly scale-free metric
  const denom = Math.max(normalizationVolume, 1e-9);
  const norm = obvSlope / denom;
  // scale: 2x typical volume per candle => full score
  return clamp(norm / 2, -1, 1);
}

function computeAtr(candles: Candle[], period: number) {
  const atrSeries = atrWilder(candles, period);
  return atrSeries.length ? latest(atrSeries) : 0;
}

function computeTechnical(candles: Candle[], config: Required<Pick<EngineConfig, 'rsiPeriod' | 'emaFast' | 'emaSlow'>>): TechnicalBreakdown {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const emaFastSeries = ema(closes, config.emaFast);
  const emaSlowSeries = ema(closes, config.emaSlow);
  const emaFast = emaFastSeries.length ? latest(emaFastSeries) : closes[closes.length - 1];
  const emaSlow = emaSlowSeries.length ? latest(emaSlowSeries) : closes[closes.length - 1];

  const rsiSeries = rsiWilder(closes, config.rsiPeriod);
  const rsi = rsiSeries.length ? latest(rsiSeries) : 50;

  const obv = obvSeries(closes, volumes);
  const obvSlope = obv.length ? computeObvSlope(obv, 20) : 0;
  const typicalVol = volumes.length >= 50 ? volumes.slice(-50).reduce((a, b) => a + b, 0) / 50 : volumes.reduce((a, b) => a + b, 0) / Math.max(volumes.length, 1);

  const emaScore = scoreEmaTrend(emaFast, emaSlow);
  const rsiScore = scoreRsi(rsi);
  const obvScore = scoreObvSlope(obvSlope, typicalVol);

  // Institutional-ish: avoid over-trusting a single indicator; smooth via weighted sub-score
  const technicalScore = clamp(0.5 * emaScore + 0.3 * rsiScore + 0.2 * obvScore, -1, 1);

  const emaTrend: TechnicalBreakdown['emaTrend'] =
    Math.abs(emaFast - emaSlow) / Math.max(Math.abs(emaSlow), 1e-9) < 0.0002
      ? 'FLAT'
      : emaFast > emaSlow
        ? 'BULL'
        : 'BEAR';

  const rsiRegime: TechnicalBreakdown['rsiRegime'] = rsi >= 70 ? 'OVERBOUGHT' : rsi <= 30 ? 'OVERSOLD' : 'NEUTRAL';

  return {
    emaFast,
    emaSlow,
    emaTrend,
    emaScore,
    rsi,
    rsiRegime,
    rsiScore,
    obvSlope,
    obvScore,
    technicalScore,
  };
}

function computeFundamental(nowIso: string, events: EconomicEvent[], windowMinutes: number): FundamentalBreakdown {
  const nowMs = parseIsoMs(nowIso);
  const windowMs = windowMinutes * 60_000;

  const highImpact = events.filter((e) => e.impact === 'HIGH');
  const reasons: string[] = [];
  let lockedUntilMs: number | undefined;

  for (const ev of highImpact) {
    const evMs = parseIsoMs(ev.time);
    const start = evMs - windowMs;
    const end = evMs + windowMs;
    if (nowMs >= start && nowMs <= end) {
      reasons.push(`NEWS_LOCK: HIGH impact "${ev.title}" at ${ev.time}`);
      lockedUntilMs = lockedUntilMs ? Math.max(lockedUntilMs, end) : end;
    }
  }

  return {
    locked: reasons.length > 0,
    lockedUntil: lockedUntilMs ? new Date(lockedUntilMs).toISOString() : undefined,
    reasons,
    fundamentalScore: 0,
  };
}

function computeRiskPlan(args: {
  instrument: InstrumentSpec;
  account: AccountSnapshot;
  side: 'BUY' | 'SELL';
  referencePrice: number;
  atr: number;
  atrSlMult: number;
  atrTpMult: number;
  riskPctPerTrade: number;
}) : RiskPlan {
  const { instrument, account, side, referencePrice, atr, atrSlMult, atrTpMult, riskPctPerTrade } = args;

  const sizingNotes: string[] = [];
  const riskAmount = account.equity * riskPctPerTrade;

  const slDistance = atr * atrSlMult;
  const tpDistance = atr * atrTpMult;

  const stopLoss = side === 'BUY' ? referencePrice - slDistance : referencePrice + slDistance;
  const takeProfit = side === 'BUY' ? referencePrice + tpDistance : referencePrice - tpDistance;

  const stopDistancePoints = Math.max(Math.round(slDistance / instrument.point), 1);

  let lotSize: number | undefined;
  if (instrument.tickValuePerLot && instrument.tickValuePerLot > 0) {
    // risk = lot * stopPoints * tickValuePerLot
    lotSize = riskAmount / (stopDistancePoints * instrument.tickValuePerLot);
    sizingNotes.push('Sizing via tickValuePerLot');
  } else if (instrument.contractSize && instrument.contractSize > 0) {
    // rough FX approximation: value per point per lot ~= contractSize * point
    const approxTickValue = instrument.contractSize * instrument.point;
    lotSize = riskAmount / (stopDistancePoints * approxTickValue);
    sizingNotes.push('Sizing via contractSize*point approximation');
  } else {
    sizingNotes.push('Lot sizing skipped (missing tickValuePerLot/contractSize)');
  }

  if (lotSize !== undefined) {
    const minLot = instrument.minLot ?? 0.01;
    const maxLot = instrument.maxLot ?? 100;
    const lotStep = instrument.lotStep ?? 0.01;
    const snapped = Math.floor(lotSize / lotStep) * lotStep;
    lotSize = clamp(snapped, minLot, maxLot);
  }

  return {
    atr,
    referencePrice,
    side,
    stopLoss: roundToDigits(stopLoss, instrument.digits),
    takeProfit: roundToDigits(takeProfit, instrument.digits),
    stopDistancePoints,
    riskAmount,
    lotSize,
    sizingNotes,
  };
}

function buildHumanReport(report: XaiReport) {
  const lines: string[] = [];
  lines.push(`Signal: ${report.decision.signal} (confidence ${report.decision.confidence.toFixed(2)})`);
  lines.push(`Symbol: ${report.instrument.symbol}`);
  lines.push(`Scores: total=${report.scores.total.toFixed(3)} | tech=${report.scores.technical.toFixed(3)} | fund=${report.scores.fundamental.toFixed(3)} | sent=${report.scores.sentiment.toFixed(3)}`);
  lines.push(`Technical: EMA${report.technical.emaTrend} (EMA${report.technical.emaFast.toFixed(5)} vs EMA${report.technical.emaSlow.toFixed(5)}) | RSI=${report.technical.rsi.toFixed(1)} (${report.technical.rsiRegime}) | OBV slope=${report.technical.obvSlope.toFixed(2)}`);

  if (report.fundamental.locked) {
    lines.push(`Fundamental: LOCKED until ${report.fundamental.lockedUntil ?? 'unknown'} (${report.fundamental.reasons.join('; ')})`);
  } else {
    lines.push('Fundamental: unlocked (no HIGH-impact news window active)');
  }

  lines.push(`Sentiment: ${report.sentiment.sentimentScore.toFixed(2)} (sources: ${report.sentiment.sources.join(', ') || 'n/a'})`);

  if (report.risk) {
    lines.push(`Risk: ATR=${report.risk.atr.toFixed(5)} | SL=${report.risk.stopLoss} | TP=${report.risk.takeProfit} | Risk=$${report.risk.riskAmount.toFixed(2)} | Lot=${report.risk.lotSize ?? 'n/a'}`);
  }

  if (report.decision.notes.length) lines.push(`Notes: ${report.decision.notes.join(' | ')}`);
  return lines.join('\n');
}

/**
 * Confluence (Technical + Fundamental + Sentiment) decision engine.
 *
 * Output:
 * - `signal` is BUY/SELL/WAIT
 * - `reportJson` is the XAI payload suitable for Supabase storage
 * - `reportText` is human-readable "thought process" for dashboards/logs
 */
export function analyzeAndDecide(input: EngineInput): EngineOutput {
  const now = isoNow(input.now);
  const cfg: Required<EngineConfig> = {
    weights: {
      technical: 0.4,
      fundamental: 0.3,
      sentiment: 0.3,
      ...input.config?.weights,
    },
    rsiPeriod: input.config?.rsiPeriod ?? 14,
    emaFast: input.config?.emaFast ?? 50,
    emaSlow: input.config?.emaSlow ?? 200,
    atrPeriod: input.config?.atrPeriod ?? 14,
    atrSlMult: input.config?.atrSlMult ?? 1.5,
    atrTpMult: input.config?.atrTpMult ?? 2.5,
    riskPctPerTrade: input.config?.riskPctPerTrade ?? 0.01,
    tradeThreshold: input.config?.tradeThreshold ?? 0.35,
    spreadAtrPenaltyThreshold: input.config?.spreadAtrPenaltyThreshold ?? 0.08,
    newsLockWindowMinutes: input.config?.newsLockWindowMinutes ?? 60,
    minCandles: input.config?.minCandles ?? 220,
  };

  const weights = weightsSchema.parse(cfg.weights);

  const candles = input.candles;
  if (!candles.length) {
    const emptyReport: XaiReport = {
      version: 1,
      generatedAt: now,
      instrument: input.instrument,
      account: input.account,
      inputs: {
        candles: { count: 0, from: now, to: now },
        market: input.market ?? {},
        economicEvents: { total: 0, highImpact: 0 },
      },
      weights,
      scores: { technical: 0, fundamental: 0, sentiment: 0, total: 0 },
      technical: {
        emaFast: 0,
        emaSlow: 0,
        emaTrend: 'FLAT',
        emaScore: 0,
        rsi: 50,
        rsiRegime: 'NEUTRAL',
        rsiScore: 0,
        obvSlope: 0,
        obvScore: 0,
        technicalScore: 0,
      },
      fundamental: { locked: true, reasons: ['No candles provided'], fundamentalScore: 0 },
      sentiment: { sentimentScore: 0, sources: [] },
      decision: {
        signal: 'WAIT',
        confidence: 0,
        confluence: { alignTechnical: false, alignSentiment: false, newsUnlocked: false, thresholdPassed: false },
        notes: ['No candles provided'],
      },
    };

    return { signal: 'WAIT', confidence: 0, locked: true, reportJson: emptyReport, reportText: buildHumanReport(emptyReport) };
  }

  const from = candles[0].time;
  const to = candles[candles.length - 1].time;

  const sentimentScoreRaw = input.sentiment?.score ?? 0;
  const sentimentScore = clamp(sentimentScoreRaw, -1, 1);
  const sentimentSources = input.sentiment?.sources ?? [];

  const events = input.fundamental?.events ?? [];
  const fundamental = computeFundamental(now, events, cfg.newsLockWindowMinutes);

  // Guardrail: ensure enough data for EMA200 / ATR / RSI.
  const notes: string[] = [];
  if (candles.length < cfg.minCandles) notes.push(`Insufficient candles: ${candles.length}/${cfg.minCandles}`);

  const technical = computeTechnical(candles, { rsiPeriod: cfg.rsiPeriod, emaFast: cfg.emaFast, emaSlow: cfg.emaSlow });
  const atr = computeAtr(candles, cfg.atrPeriod);
  if (atr <= 0) notes.push('ATR unavailable (indicator underflow)');

  // Aggregate score
  const technicalWeighted = technical.technicalScore * weights.technical;
  const fundamentalWeighted = fundamental.fundamentalScore * weights.fundamental;
  const sentimentWeighted = sentimentScore * weights.sentiment;
  const totalScore = clamp(technicalWeighted + fundamentalWeighted + sentimentWeighted, -1, 1);

  const referencePrice = input.market?.bid && input.market?.ask
    ? (input.market.bid + input.market.ask) / 2
    : candles[candles.length - 1].close;

  // Confluence gating
  const newsUnlocked = !fundamental.locked;
  const thresholdPassed = Math.abs(totalScore) >= cfg.tradeThreshold;
  const alignTechnical = Math.sign(totalScore) === Math.sign(technical.technicalScore) && Math.abs(technical.technicalScore) >= 0.15;
  const alignSentiment = Math.sign(totalScore) === Math.sign(sentimentScore) && Math.abs(sentimentScore) >= 0.1;

  // Spread sanity penalty
  let confidence = clamp(Math.abs(totalScore), 0, 1);
  if (input.market?.bid !== undefined && input.market?.ask !== undefined && atr > 0) {
    const spread = Math.max(input.market.ask - input.market.bid, 0);
    const spreadFracAtr = spread / atr;
    if (spreadFracAtr > cfg.spreadAtrPenaltyThreshold) {
      const penalty = clamp((spreadFracAtr - cfg.spreadAtrPenaltyThreshold) / cfg.spreadAtrPenaltyThreshold, 0, 1);
      confidence *= 1 - 0.5 * penalty;
      notes.push(`Spread penalty applied (spread/ATR=${spreadFracAtr.toFixed(3)})`);
    }
  }

  let signal: TradeSignal = 'WAIT';
  if (!newsUnlocked) {
    signal = 'WAIT';
    notes.push('Trading locked by news filter');
  } else if (candles.length < cfg.minCandles || atr <= 0) {
    signal = 'WAIT';
  } else if (!thresholdPassed) {
    signal = 'WAIT';
    notes.push(`Threshold not passed (|score|<${cfg.tradeThreshold})`);
  } else {
    // Institutional-ish confluence: require at least technical alignment; sentiment alignment boosts confidence but is optional.
    if (!alignTechnical) {
      signal = 'WAIT';
      notes.push('No technical alignment with total score');
    } else {
      signal = totalScore > 0 ? 'BUY' : 'SELL';
      if (!alignSentiment) notes.push('Sentiment not aligned (trade allowed, but lower quality)');
    }
  }

  // Risk plan only when we intend to trade
  const risk =
    signal === 'BUY' || signal === 'SELL'
      ? computeRiskPlan({
          instrument: input.instrument,
          account: input.account,
          side: signal,
          referencePrice,
          atr,
          atrSlMult: cfg.atrSlMult,
          atrTpMult: cfg.atrTpMult,
          riskPctPerTrade: cfg.riskPctPerTrade,
        })
      : undefined;

  // Confidence floor/ceiling adjustments
  if (signal === 'WAIT') confidence = clamp(confidence * 0.5, 0, 0.65);
  if (signal !== 'WAIT' && alignSentiment) confidence = clamp(confidence + 0.1, 0, 1);

  const report: XaiReport = {
    version: 1,
    generatedAt: now,
    instrument: input.instrument,
    account: input.account,
    inputs: {
      candles: { count: candles.length, from, to },
      market: input.market ?? {},
      economicEvents: { total: events.length, highImpact: events.filter((e) => e.impact === 'HIGH').length },
    },
    sentiment: { sentimentScore, sources: sentimentSources },
    weights,
    scores: {
      technical: technicalWeighted,
      fundamental: fundamentalWeighted,
      sentiment: sentimentWeighted,
      total: totalScore,
    },
    technical,
    fundamental,
    decision: {
      signal,
      confidence: clamp(confidence, 0, 1),
      confluence: {
        alignTechnical,
        alignSentiment,
        newsUnlocked,
        thresholdPassed,
      },
      notes,
    },
    risk,
  };

  return {
    signal,
    confidence: report.decision.confidence,
    locked: !newsUnlocked,
    reportJson: report,
    reportText: buildHumanReport(report),
  };
}
