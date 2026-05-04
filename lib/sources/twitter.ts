import { TwitterApi } from 'twitter-api-v2';
import { env } from '@/lib/env';

export type TweetItem = {
  source: 'twitter';
  id: string;
  text: string;
  createdAt?: string;
  authorId?: string;
};

export async function fetchRecentTweets(args: { query: string; limit: number }): Promise<TweetItem[]> {
  const e = env();
  if (!e.TWITTER_BEARER_TOKEN) return [];

  const client = new TwitterApi(e.TWITTER_BEARER_TOKEN);
  const res = await client.v2.search(args.query, {
    max_results: Math.min(Math.max(args.limit, 10), 100),
    'tweet.fields': ['created_at', 'author_id'],
  });

  const tweets: any[] = [];
  // twitter-api-v2 returns an async paginator; collect up to limit.
  for await (const t of res) {
    tweets.push(t);
    if (tweets.length >= args.limit) break;
  }

  return tweets.map((t) => ({
    source: 'twitter' as const,
    id: String(t.id),
    text: String(t.text ?? ''),
    createdAt: t.created_at ? new Date(t.created_at).toISOString() : undefined,
    authorId: t.author_id ? String(t.author_id) : undefined,
  }));
}

