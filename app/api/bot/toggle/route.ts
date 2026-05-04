import { env } from '@/lib/env';
import { getBotSettings, updateBotSettings } from '@/lib/db/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

export async function POST(req: Request) {
  const e = env();
  const secret = e.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (token !== secret) return unauthorized();
  }

  const current = await getBotSettings();
  const next = await updateBotSettings({ enabled: !current.enabled });
  return Response.json({ ok: true, settings: next });
}

