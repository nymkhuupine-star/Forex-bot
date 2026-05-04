import type { XaiReport } from '@/lib/analysis/engine';

export function ThoughtProcess(props: { report: XaiReport }) {
  const r = props.report;
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-neutral-500">Ботын “Бодлын процесс”</div>
      <div className="mt-2 grid gap-2 text-sm">
        <div>
          <span className="font-medium">Сигнал:</span> {r.decision.signal} ({r.decision.confidence.toFixed(2)})
        </div>
        <div>
          <span className="font-medium">Оноо:</span> нийт {r.scores.total.toFixed(3)} / тех {r.scores.technical.toFixed(3)} / сэтгэлзүй{' '}
          {r.scores.sentiment.toFixed(3)}
        </div>
        <div>
          <span className="font-medium">Техник:</span> EMA {r.technical.emaTrend}, RSI {r.technical.rsi.toFixed(1)} ({r.technical.rsiRegime})
        </div>
        <div>
          <span className="font-medium">Фундаментал:</span>{' '}
          {r.fundamental.locked ? `ТҮГЖСЭН (${r.fundamental.lockedUntil ?? 'n/a'})` : 'нээлттэй'}
        </div>
        <div>
          <span className="font-medium">Тэмдэглэл:</span> {r.decision.notes.length ? r.decision.notes.join(' | ') : '—'}
        </div>
      </div>
    </div>
  );
}
