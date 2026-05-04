import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),

  CRON_SECRET: z.string().min(16).optional(),

  // Broker (MetaApi)
  METAAPI_TOKEN: z.string().min(10),
  METAAPI_ACCOUNT_ID: z.string().min(3),
  METAAPI_REGION: z.string().min(2).optional(), // e.g. 'new-york', 'london' (optional)

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Trading/bot controls
  BOT_SYMBOLS: z.string().default('EURUSD'),
  BOT_TIMEFRAME: z.string().default('1m'),
  BOT_MAX_SPREAD_ATR_FRAC: z.coerce.number().min(0).max(1).default(0.08),
  BOT_TRADE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
  BOT_RISK_PCT: z.coerce.number().min(0).max(0.1).default(0.01),
  BOT_ATR_SL_MULT: z.coerce.number().min(0.1).max(20).default(1.5),
  BOT_ATR_TP_MULT: z.coerce.number().min(0.1).max(50).default(2.5),
  BOT_NEWS_LOCK_MINUTES: z.coerce.number().min(0).max(360).default(60),
  BOT_EXECUTION_MODE: z.enum(['dry_run', 'live']).default('dry_run'),

  // Sentiment sources + LLM
  NEWSAPI_KEY: z.string().min(10).optional(),
  TWITTER_BEARER_TOKEN: z.string().min(10).optional(),

  // Economic calendar (fundamental filter)
  ECON_CALENDAR_PROVIDER: z.enum(['tradingeconomics', 'fmp']).default('tradingeconomics'),
  TRADINGECONOMICS_API_KEY: z.string().min(3).optional(), // optional; defaults to guest:guest
  FMP_API_KEY: z.string().min(10).optional(),

  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  OPENAI_API_KEY: z.string().min(10).optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  // Next.js runs in multiple contexts; only validate once per process.
  cached = envSchema.parse(process.env);
  return cached;
}
