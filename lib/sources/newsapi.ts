import NewsAPI from 'newsapi';
import { env } from '@/lib/env';

export type NewsItem = {
  source: 'newsapi';
  title: string;
  description?: string;
  url?: string;
  publishedAt?: string;
};

export async function fetchNewsHeadlines(args: { query: string; limit: number }): Promise<NewsItem[]> {
  const e = env();
  if (!e.NEWSAPI_KEY) return [];

  const api = new (NewsAPI as any)(e.NEWSAPI_KEY);
  const res = await api.v2.everything({
    q: args.query,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: Math.min(args.limit, 100),
  });

  const articles = (res?.articles ?? []) as any[];
  return articles.slice(0, args.limit).map((a) => ({
    source: 'newsapi' as const,
    title: String(a.title ?? ''),
    description: a.description ? String(a.description) : undefined,
    url: a.url ? String(a.url) : undefined,
    publishedAt: a.publishedAt ? new Date(a.publishedAt).toISOString() : undefined,
  }));
}

