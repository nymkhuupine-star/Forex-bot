'use client';

import { useMemo } from 'react';

export type PnLPoint = { time: string; equity: number };

export function PnLChart(props: { data: PnLPoint[] }) {
  const latest = useMemo(() => props.data[props.data.length - 1], [props.data]);

  // TODO: Replace with a real chart library (e.g. recharts) once the data pipeline is wired.
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-neutral-500">Real-time P&amp;L</div>
      <div className="mt-2 text-2xl font-semibold">{latest ? latest.equity.toFixed(2) : '—'}</div>
      <div className="mt-1 text-xs text-neutral-500">{latest ? latest.time : 'No data'}</div>
    </div>
  );
}

