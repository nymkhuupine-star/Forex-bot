import { fetchNewsHeadlines } from '@/lib/sources/newsapi';
import { fetchRecentTweets } from '@/lib/sources/twitter';
import { llmSentiment } from '@/lib/sentiment/llm';

export type SentimentPipelineResult = {
  score: number; // [-1..1]
  sources: string[];
  rationale: string;
  keywords: string[];
  rawCount: { news: number; tweets: number };
};

export async function computeSentiment(args: { symbol: string; query: string; limitNews?: number; limitTweets?: number }): Promise<SentimentPipelineResult> {
  const limitNews = args.limitNews ?? 15;
  const limitTweets = args.limitTweets ?? 25;

  const [news, tweets] = await Promise.all([
    fetchNewsHeadlines({ query: args.query, limit: limitNews }),
    fetchRecentTweets({ query: args.query, limit: limitTweets }),
  ]);

  const blocks: string[] = [];
  if (news.length) {
    blocks.push('NEWS (NewsAPI):');
    for (const n of news) blocks.push(`- ${n.publishedAt ?? ''} ${n.title}${n.description ? ` — ${n.description}` : ''}`);
  }
  if (tweets.length) {
    blocks.push('TWEETS (Twitter):');
    for (const t of tweets) blocks.push(`- ${t.createdAt ?? ''} ${t.text}`);
  }
  if (!blocks.length) {
    return { score: 0, sources: [], rationale: 'No sentiment sources configured/available.', keywords: [], rawCount: { news: 0, tweets: 0 } };
  }

  const ctx = blocks.join('\n');
  const llm = await llmSentiment({ symbol: args.symbol, context: ctx });

  const sources: string[] = [];
  if (news.length) sources.push('newsapi');
  if (tweets.length) sources.push('twitter');

  return {
    score: llm.score,
    sources,
    rationale: llm.rationale,
    keywords: llm.keywords ?? [],
    rawCount: { news: news.length, tweets: tweets.length },
  };
}

