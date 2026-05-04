import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardClient } from './ui';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">XM (MT5) Олон‑хүчин зүйлт бот</h1>
              <Badge variant="muted">Хянах самбар</Badge>
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Шууд хяналт + удирдлага (сервер талд MetaApi‑ээр ажиллана).</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="muted">Зөвлөмж: эхлээд `BOT_EXECUTION_MODE=dry_run` ашигла</Badge>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle>Төлөв (Real‑time)</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardClient />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
