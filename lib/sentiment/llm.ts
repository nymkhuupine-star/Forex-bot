import { generateObject } from 'ai';
import { z } from 'zod';
import { env } from '@/lib/env';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

const sentimentSchema = z.object({
  score: z.number().min(-1).max(1),
  rationale: z.string().min(1),
  keywords: z.array(z.string()).max(20).default([]),
});

export type LlmSentiment = z.infer<typeof sentimentSchema>;

export async function llmSentiment(args: { symbol: string; context: string }) {
  const e = env();
  const model =
    e.AI_PROVIDER === 'anthropic'
      ? anthropic('claude-3-5-sonnet-latest')
      : openai('gpt-4.1-mini');

  const result = await generateObject({
    model,
    schema: sentimentSchema,
    prompt: [
      'You are an institutional FX sentiment analyst.',
      'Return a strict JSON object that follows the schema exactly.',
      '',
      `Instrument: ${args.symbol}`,
      'Task: Given the news/tweets context, output a sentiment score in [-1,1] where:',
      '-1 = strongly bearish, 0 = neutral/unclear, +1 = strongly bullish.',
      'Be conservative; avoid overconfidence.',
      '',
      'Context:',
      args.context,
    ].join('\n'),
  });

  return result.object as LlmSentiment;
}

