import MetaApi from 'metaapi.cloud-sdk';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export type Candle = {
  time: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketSnapshot = {
  bid: number;
  ask: number;
};

export type AccountSnapshot = {
  equity: number;
  balance: number;
  currency?: string;
};

export type SymbolSpec = {
  symbol: string;
  digits: number;
  point: number;
  contractSize?: number;
  minLot?: number;
  lotStep?: number;
  maxLot?: number;
  tickValuePerLot?: number;
};

export type PlaceOrderRequest = {
  symbol: string;
  side: 'BUY' | 'SELL';
  lot: number;
  stopLoss: number;
  takeProfit: number;
  comment?: string;
};

export type PlaceOrderResult = {
  broker: 'metaapi';
  orderId?: string;
  positionId?: string;
  raw?: unknown;
};

type Connection = {
  getAccountInformation: () => Promise<any>;
  getSymbolSpecification: (symbol: string) => Promise<any>;
  getSymbolPrice: (symbol: string) => Promise<any>;
  getHistoricalCandles: (symbol: string, timeframe: string, startTime: Date) => Promise<any[]>;
  createMarketBuyOrder: (symbol: string, volume: number, stopLoss?: number, takeProfit?: number, options?: any) => Promise<any>;
  createMarketSellOrder: (symbol: string, volume: number, stopLoss?: number, takeProfit?: number, options?: any) => Promise<any>;
};

let cached: { connection: Connection; accountId: string } | undefined;

async function getConnection(): Promise<Connection> {
  const e = env();
  if (cached?.accountId === e.METAAPI_ACCOUNT_ID) return cached.connection;

  const api = new (MetaApi as any)(e.METAAPI_TOKEN, e.METAAPI_REGION ? { region: e.METAAPI_REGION } : undefined);
  const account = await api.metatraderAccountApi.getAccount(e.METAAPI_ACCOUNT_ID);

  if (account.state !== 'DEPLOYED') {
    logger.info({ state: account.state }, 'MetaApi account not deployed; deploying');
    await account.deploy();
  }

  logger.info('Waiting for MetaApi connection…');
  await account.waitConnected();
  const connection = (await account.getRPCConnection()) as Connection;
  await (connection as any).connect?.();
  await (connection as any).waitSynchronized?.();

  cached = { connection, accountId: e.METAAPI_ACCOUNT_ID };
  return connection;
}

export async function fetchAccountSnapshot(): Promise<AccountSnapshot> {
  const c = await getConnection();
  const info = await c.getAccountInformation();
  return {
    equity: Number(info.equity),
    balance: Number(info.balance),
    currency: info.currency,
  };
}

export async function fetchSymbolSpec(symbol: string): Promise<SymbolSpec> {
  const c = await getConnection();
  const spec = await c.getSymbolSpecification(symbol);

  const digits = Number(spec.digits ?? spec.digit);
  const point = Number(spec.point ?? 10 ** -digits);

  return {
    symbol,
    digits,
    point,
    contractSize: spec.contractSize ? Number(spec.contractSize) : undefined,
    minLot: spec.minVolume ? Number(spec.minVolume) : undefined,
    lotStep: spec.volumeStep ? Number(spec.volumeStep) : undefined,
    maxLot: spec.maxVolume ? Number(spec.maxVolume) : undefined,
    tickValuePerLot: spec.tickValue ? Number(spec.tickValue) : undefined,
  };
}

export async function fetchMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const c = await getConnection();
  const p = await c.getSymbolPrice(symbol);
  return { bid: Number(p.bid), ask: Number(p.ask) };
}

export async function fetchCandles(args: { symbol: string; timeframe: Timeframe; lookbackCandles: number }): Promise<Candle[]> {
  const { symbol, timeframe, lookbackCandles } = args;
  const c = await getConnection();

  // MetaApi expects startTime; request a safe window.
  // For 1m: 300 candles ~= 5 hours. Use a wider net; we slice to required length after.
  const minutesByTf: Record<Timeframe, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
  const backMinutes = minutesByTf[timeframe] * Math.max(lookbackCandles * 2, lookbackCandles);
  const start = new Date(Date.now() - backMinutes * 60_000);

  const raw = await c.getHistoricalCandles(symbol, timeframe, start);
  const candles: Candle[] = raw
    .map((x: any) => ({
      time: new Date(x.time ?? x.timestamp ?? x.startTime ?? x.brokerTime).toISOString(),
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
      volume: Number(x.tickVolume ?? x.volume ?? 0),
    }))
    .filter((k: Candle) => Number.isFinite(k.open) && Number.isFinite(k.close) && Number.isFinite(k.high) && Number.isFinite(k.low))
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

  return candles.slice(-lookbackCandles);
}

export async function placeMarketOrder(req: PlaceOrderRequest): Promise<PlaceOrderResult> {
  const c = await getConnection();
  const side = req.side;
  const options = req.comment ? { comment: req.comment } : undefined;

  const res =
    side === 'BUY'
      ? await c.createMarketBuyOrder(req.symbol, req.lot, req.stopLoss, req.takeProfit, options)
      : await c.createMarketSellOrder(req.symbol, req.lot, req.stopLoss, req.takeProfit, options);

  return {
    broker: 'metaapi',
    orderId: res?.orderId ?? res?.id,
    positionId: res?.positionId,
    raw: res,
  };
}

