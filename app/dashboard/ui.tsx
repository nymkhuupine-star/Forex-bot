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

export function DashboardClient() {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [riskPct, setRiskPct] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [candles, setCandles] = useState<Array<{ time: number; open: number; high: number; low: number; close: number }>>([]);

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
      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Данс</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Төлөв</span>
                <Badge variant={enabled ? 'success' : 'muted'}>{enabled ? 'ИДЭВХТЭЙ' : 'УНТАЖ БАЙНА'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Баланс</span>
                <span className="font-medium">
                  {state ? money(state.account.balance) : '—'} {state?.account.currency ?? ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Экуити</span>
                <span className="font-medium">
                  {state ? money(state.account.equity) : '—'} {state?.account.currency ?? ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Горим</span>
                <Badge variant="muted">{state?.mode ?? '—'}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
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
          <PriceChart candles={chartCandles} />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Сүүлийн үйлдлүүд</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-xs">
                {(state?.trades ?? []).slice(0, 8).map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate">
                      <span className={t.side === 'BUY' ? 'text-emerald-600' : 'text-red-600'}>{t.side}</span> {t.symbol} • лот {t.lot}
                    </div>
                    <div className="text-zinc-500">{new Date(t.created_at).toLocaleString()}</div>
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
