'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { PriceChart } from '@/components/dashboard';

type StateResponse = {
  ok: true;
  symbol: string;
  timeframe: string;
  mode: string;
  account: { equity: number; balance: number; currency?: string };
  settings: { enabled: boolean; risk_pct: number };
  lastRun: any | null;
  trades: any[];
  events24h: Array<{ time: string; title: string; currency?: string; impact: string }>;
};

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function cn(...classes: Array<string | undefined | false>) {
  return classes.filter(Boolean).join(' ');
}

function sentimentLabel(score: number) {
  if (score >= 0.25) return { text: 'Өөдрөг (Bullish)', color: 'text-emerald-600' };
  if (score <= -0.25) return { text: 'Сөрөг (Bearish)', color: 'text-red-600' };
  return { text: 'Төвийг сахисан', color: 'text-zinc-500' };
}

function StatCard(props: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-zinc-500">{props.label}</div>
        <div className="mt-1 text-lg font-semibold">{props.value}</div>
        {props.sub ? <div className="mt-1 text-xs text-zinc-500">{props.sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export function DashboardClient() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  async function refresh() {
    try {
      setError(null);
      const res = await fetch('/api/dashboard/state', { cache: 'no-store' });
      const json = (await res.json()) as StateResponse;
      setState(json);
      setRiskPct(Math.round((json.settings.risk_pct ?? 0.01) * 1000) / 10);

      const cRes = await fetch(`/api/dashboard/candles?symbol=${encodeURIComponent(json.symbol)}&timeframe=${encodeURIComponent(json.timeframe)}&limit=300`, {
        cache: 'no-store',
      });
      const cJson = (await cRes.json()) as any;
      setCandles(cJson.candles ?? []);
      setLastUpdatedAt(new Date());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const lastTradeExplanation = useMemo(() => {
    if (!state?.trades?.length) return null;
    const t = state.trades[0];
    const side = t.side as 'BUY' | 'SELL';
    const explanation = t.meta?.explanation as string | undefined;
    if (!explanation) return null;
    return { side, explanation };
  }, [state?.trades]);

  const chartCandles = useMemo(() => candles, [candles]);

  const todayTrades = useMemo(() => {
    if (!state?.trades?.length) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return state.trades.filter((t) => Date.parse(t.created_at) >= startMs);
  }, [state?.trades]);

  const todayCount = todayTrades.length;
  const floatingPnL = state ? state.account.equity - state.account.balance : 0;
  const lastSentimentScore = Number(state?.lastRun?.report?.sentiment?.sentimentScore ?? state?.lastRun?.report?.sentiment?.score ?? 0);
  const sent = sentimentLabel(Number.isFinite(lastSentimentScore) ? lastSentimentScore : 0);

  async function toggleBot() {
    setSaving(true);
    try {
      await fetch('/api/bot/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveRisk(nextPct: number) {
    setSaving(true);
    try {
      await fetch('/api/bot/settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ risk_pct: nextPct / 100 }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  const enabled = !!state?.settings?.enabled;

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          Алдаа: {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          label="Ботын төлөв"
          value={<span className={enabled ? 'text-emerald-600' : 'text-zinc-500'}>{enabled ? 'ИДЭВХТЭЙ' : 'УНТАЖ БАЙНА'}</span>}
          sub={
            <span className="text-zinc-500">
              Горим: <span className="text-zinc-900 dark:text-zinc-50">{state?.mode ?? '—'}</span>
            </span>
          }
        />
        <StatCard
          label="Баланс"
          value={
            <span>
              {state ? money(state.account.balance) : '—'} <span className="text-sm font-normal text-zinc-500">{state?.account.currency ?? ''}</span>
            </span>
          }
        />
        <StatCard
          label="Экуити"
          value={
            <span>
              {state ? money(state.account.equity) : '—'} <span className="text-sm font-normal text-zinc-500">{state?.account.currency ?? ''}</span>
            </span>
          }
          sub={
            state ? (
              <span className={cn('text-xs', floatingPnL >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                Нээлттэй P&L: {floatingPnL >= 0 ? '+' : ''}
                {money(floatingPnL)}
              </span>
            ) : null
          }
        />
        <StatCard
          label="Өнөөдрийн үйлдэл"
          value={<span>{todayCount}</span>}
          sub={lastUpdatedAt ? `Сүүлд шинэчилсэн: ${lastUpdatedAt.toLocaleTimeString()}` : '—'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>AI Шийдвэрийн лог</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Хослол</span>
                <span className="font-medium">{state?.symbol ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Хугацааны хүрээ</span>
                <span className="font-medium">{state?.timeframe ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Sentiment</span>
                <div className="text-right">
                  <div className={cn('font-medium', sent.color)}>{sent.text}</div>
                  <div className="text-xs text-zinc-500">Оноо: {Number.isFinite(lastSentimentScore) ? lastSentimentScore.toFixed(2) : '—'}</div>
                </div>
              </div>
              <div className="rounded-md border border-zinc-200 p-3 text-xs leading-5 dark:border-zinc-800">
                {lastTradeExplanation ? (
                  <div className={lastTradeExplanation.side === 'BUY' ? 'text-emerald-600' : 'text-red-600'}>
                    {lastTradeExplanation.explanation}
                  </div>
                ) : (
                  <div className="text-zinc-500">Одоогоор арилжааны тайлбар алга.</div>
                )}
              </div>
              <div className="text-xs text-zinc-500">
                Сүүлийн сигнал: <span className="text-zinc-900 dark:text-zinc-50">{state?.lastRun?.signal ?? '—'}</span> • Итгэлцүүр{' '}
                {state?.lastRun?.confidence?.toFixed?.(2) ?? '—'}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-6">
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">График</div>
              <div className="text-xs text-zinc-500">
                {state?.symbol ?? '—'} • {state?.timeframe ?? '—'}
              </div>
            </div>
            <PriceChart candles={chartCandles} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Сүүлийн үйлдлүүд</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs">
                {(state?.trades ?? []).slice(0, 8).map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 rounded-md border border-zinc-100 p-2 dark:border-zinc-900">
                    <div className="min-w-0">
                      <div className="truncate">
                        <span className={t.side === 'BUY' ? 'text-emerald-600' : 'text-red-600'}>{t.side}</span> {t.symbol}{' '}
                        <span className="text-zinc-500">• лот {t.lot}</span>
                      </div>
                      <div className="truncate text-zinc-500">{t.meta?.explanation ? String(t.meta.explanation) : '—'}</div>
                    </div>
                    <div className="shrink-0 text-right text-zinc-500">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                ))}
                {!state?.trades?.length ? <div className="text-zinc-500">Одоогоор арилжаа алга.</div> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Өндөр нөлөөтэй мэдээ (24 цаг)</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs">
                {(state?.events24h ?? []).slice(0, 10).map((ev, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate">{ev.title}</div>
                      <div className="text-zinc-500">
                        {ev.currency ?? '—'} • {new Date(ev.time).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="muted">{ev.impact}</Badge>
                  </div>
                ))}
                {!state?.events24h?.length ? <div className="text-zinc-500">Мэдээ олдсонгүй.</div> : null}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Удирдлага</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div className="grid gap-2">
                <Button onClick={toggleBot} disabled={saving} variant={enabled ? 'outline' : 'default'}>
                  {enabled ? 'Бот зогсоох' : 'Бот эхлүүлэх'}
                </Button>
                <Button disabled variant="destructive" title="Дараагийн алхамд MetaApi дээр position close-ийг холбоно">
                  Яаралтай гар аргаар хаах (TODO)
                </Button>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Эрсдэл %</span>
                  <span className="font-medium">{riskPct.toFixed(1)}%</span>
                </div>
                <Slider value={riskPct} min={0.1} max={3} step={0.1} onChange={setRiskPct} />
                <Button size="sm" variant="outline" disabled={saving} onClick={() => saveRisk(riskPct)}>
                  Эрсдэл хадгалах
                </Button>
                <div className="text-xs text-zinc-500">Supabase `bot_settings` дээр хадгална. Cron арилжаа бүрт үүнийг хэрэглэнэ.</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
