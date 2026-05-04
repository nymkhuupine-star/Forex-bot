import { env } from '@/lib/env';

export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type EconomicEvent = {
  time: string; // ISO
  title: string;
  currency?: string;
  impact: ImpactLevel;
};

type Provider = 'tradingeconomics' | 'fmp';

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function normalizeImpact(value: unknown): ImpactLevel | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (value >= 3) return 'HIGH';
    if (value === 2) return 'MEDIUM';
    if (value === 1) return 'LOW';
    return null;
  }
  const s = String(value).toLowerCase();
  if (s.includes('high') || s === '3') return 'HIGH';
  if (s.includes('medium') || s === '2') return 'MEDIUM';
  if (s.includes('low') || s === '1') return 'LOW';
  return null;
}

function currencyFromEvent(raw: any): string | undefined {
  const c = raw.Currency ?? raw.currency ?? raw.currencyCode ?? raw.ccy;
  return c ? String(c).toUpperCase() : undefined;
}

function titleFromEvent(raw: any): string {
  const t = raw.Event ?? raw.event ?? raw.Title ?? raw.title ?? raw.Name ?? raw.name;
  return t ? String(t) : 'Economic Event';
}

function timeFromEvent(raw: any): string | null {
  // TradingEconomics commonly uses Date / DateUtc, but keep tolerant.
  return (
    toIso(raw.DateUtc) ??
    toIso(raw.dateUtc) ??
    toIso(raw.Date) ??
    toIso(raw.date) ??
    toIso(raw.time) ??
    toIso(raw.timestamp)
  );
}

async function fetchTradingEconomicsHighImpact(args: { currencies?: string[]; fromIso: string; toIso: string }): Promise<EconomicEvent[]> {
  const e = env();
  const key = e.TRADINGECONOMICS_API_KEY ?? 'guest:guest';

  const url = new URL('https://api.tradingeconomics.com/calendar');
  url.searchParams.set('c', key);
  url.searchParams.set('importance', '3');
  url.searchParams.set('f', 'json');

  // Optional time filter. TE supports `d1` / `d2` in many endpoints; apply if available.
  url.searchParams.set('d1', args.fromIso.slice(0, 10));
  url.searchParams.set('d2', args.toIso.slice(0, 10));

  const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`TradingEconomics calendar fetch failed: ${res.status} ${res.statusText}`);

  const data = (await res.json()) as any[];
  const currencies = (args.currencies ?? []).map((x) => x.toUpperCase());

  const out: EconomicEvent[] = [];
  for (const raw of data ?? []) {
    const impact = normalizeImpact(raw.Importance ?? raw.importance ?? raw.impact) ?? 'HIGH';
    if (impact !== 'HIGH') continue;

    const time = timeFromEvent(raw);
    if (!time) continue;

    const currency = currencyFromEvent(raw);
    if (currencies.length && currency && !currencies.includes(currency)) continue;

    out.push({
      time,
      title: titleFromEvent(raw),
      currency,
      impact: 'HIGH',
    });
  }

  // Narrow to the requested interval if the provider returned more than needed.
  const fromMs = Date.parse(args.fromIso);
  const toMs = Date.parse(args.toIso);
  return out
    .filter((ev) => {
      const t = Date.parse(ev.time);
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

async function fetchFmpHighImpact(_args: { currencies?: string[]; fromIso: string; toIso: string }): Promise<EconomicEvent[]> {
  // FMP endpoint exists, but impact metadata varies; keep this provider as a placeholder for now.
  // https://financialmodelingprep.com/stable/economic-calendar
  return [];
}

export async function fetchHighImpactEconomicEvents(args: { currencies?: string[]; fromIso: string; toIso: string }): Promise<EconomicEvent[]> {
  const e = env();
  const provider = (e.ECON_CALENDAR_PROVIDER ?? 'tradingeconomics') as Provider;

  if (provider === 'fmp') return fetchFmpHighImpact(args);
  return fetchTradingEconomicsHighImpact(args);
}

