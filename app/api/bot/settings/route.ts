import { env } from '@/lib/env';
import { getBotSettings, updateBotSettings } from '@/lib/db/supabase';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

export async function GET() {
  const settings = await getBotSettings();
  return Response.json({ ok: true, settings });
}

export async function POST(req: Request) {
  const e = env();
  const secret = e.CRON_SECRET;
  if (secret) {
    const header = req.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (token !== secret) return unauthorized();
  }

  const schema = z.object({ risk_pct: z.number().min(0.001).max(0.05) });
  const body = schema.parse(await req.json());
  const settings = await updateBotSettings({ risk_pct: body.risk_pct });
  return Response.json({ ok: true, settings });
}

