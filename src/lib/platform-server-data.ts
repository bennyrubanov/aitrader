import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/admin';
import { createPublicClient } from '@/utils/supabase/public';

export type RecommendationBucket = 'buy' | 'hold' | 'sell' | null;

export type DailyRow = {
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  confidence: number | null;
  bucket: RecommendationBucket;
  updatedAt: string | null;
};

type DailyResponseRow = {
  score: number | null;
  latent_rank: number | null;
  confidence: number | null;
  bucket: RecommendationBucket;
  updated_at: string | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

export type WeeklyRecommendationRow = {
  stockId: string;
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  isTop20: boolean;
  runDate: string | null;
};

type AnalysisRow = {
  stock_id: string;
  score: number | null;
  latent_rank: number | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

export type ExitActionRow = {
  symbol: string;
  action_label: string;
};

export type RatingsRow = {
  stockId: string;
  symbol: string;
  name: string | null;
  score: number | null;
  rank: number;
  bucket: RecommendationBucket;
  rankChange: number | null;
  bucketChange: 'up' | 'down' | 'same' | null;
  avgScore4w: number | null;
  avgBucket4w: RecommendationBucket;
  reason1s: string | null;
  lastPrice: string | null;
  priceDate: string | null;
  isTop20: boolean;
  updatedAt: string | null;
};

export type RatingsPageData = {
  rows: RatingsRow[];
  errorMessage: string | null;
  strategy: {
    id: string;
    slug: string;
    name: string;
    isDefault: boolean;
  } | null;
  latestRunDate: string | null;
};

type RatingsStrategyRow = {
  id: string;
  slug: string;
  name: string;
  is_default: boolean;
};

type CurrentRecommendationRow = {
  stock_id: string;
  score: number | null;
  latent_rank: number | null;
  score_delta: number | null;
  bucket: RecommendationBucket;
  reason_1s: string | null;
  updated_at: string | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

type StrategyAnalysisRow = {
  stock_id: string;
  score: number | null;
  latent_rank: number | null;
  score_delta: number | null;
  bucket: RecommendationBucket;
  reason_1s: string | null;
  created_at: string | null;
  stocks:
    | { symbol: string; company_name: string | null }
    | { symbol: string; company_name: string | null }[]
    | null;
};

type LatestPriceRow = {
  symbol: string;
  last_sale_price: string | null;
  run_date: string | null;
};

type BatchScoreRow = {
  stock_id: string;
  batch_id: string;
  score: number | null;
};

type RatingsBaseRow = {
  stockId: string;
  symbol: string;
  name: string | null;
  score: number | null;
  latentRank: number | null;
  bucket: RecommendationBucket;
  reason1s: string | null;
  updatedAt: string | null;
};

type BatchRankingRow = {
  stock_id: string;
  batch_id: string;
  score: number | null;
  latent_rank: number | null;
  bucket: RecommendationBucket;
};

const bucketFromScore = (score: number | null): RecommendationBucket => {
  if (score === null || Number.isNaN(score)) {
    return null;
  }
  if (score >= 2) {
    return 'buy';
  }
  if (score <= -2) {
    return 'sell';
  }
  return 'hold';
};

const averageScores = (scores: number[]) => {
  if (!scores.length) {
    return null;
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Number(average.toFixed(2));
};

const assignRanks = (rows: RatingsBaseRow[]) => {
  const sorted = [...rows].sort((a, b) => {
    const latentA = a.latentRank ?? -1;
    const latentB = b.latentRank ?? -1;
    if (latentA !== latentB) {
      return latentB - latentA;
    }
    const scoreA = a.score ?? -999;
    const scoreB = b.score ?? -999;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  let previousKey: string | null = null;
  let previousRank = 1;

  return sorted.map((row, index) => {
    const currentKey = `${row.latentRank ?? 'null'}:${row.score ?? 'null'}`;
    const rank = index === 0 ? 1 : currentKey === previousKey ? previousRank : index + 1;
    previousKey = currentKey;
    previousRank = rank;
    return { row, rank };
  });
};

const buildRankMap = (
  rows: Array<{ stock_id: string; score: number | null; latent_rank: number | null }>
) => {
  const sorted = [...rows].sort((a, b) => {
    const latentA = a.latent_rank ?? -1;
    const latentB = b.latent_rank ?? -1;
    if (latentA !== latentB) {
      return latentB - latentA;
    }
    const scoreA = a.score ?? -999;
    const scoreB = b.score ?? -999;
    if (scoreA !== scoreB) {
      return scoreB - scoreA;
    }
    return a.stock_id.localeCompare(b.stock_id);
  });

  const rankMap = new Map<string, number>();
  let previousKey: string | null = null;
  let previousRank = 1;

  sorted.forEach((row, index) => {
    const currentKey = `${row.latent_rank ?? 'null'}:${row.score ?? 'null'}`;
    const rank = index === 0 ? 1 : currentKey === previousKey ? previousRank : index + 1;
    previousKey = currentKey;
    previousRank = rank;
    rankMap.set(row.stock_id, rank);
  });

  return rankMap;
};

const bucketOrderValue = (bucket: RecommendationBucket) => {
  if (bucket === 'buy') return 2;
  if (bucket === 'hold') return 1;
  if (bucket === 'sell') return 0;
  return null;
};

const getBucketChange = (
  current: RecommendationBucket,
  previous: RecommendationBucket
): 'up' | 'down' | 'same' | null => {
  const currentValue = bucketOrderValue(current);
  const previousValue = bucketOrderValue(previous);
  if (currentValue === null || previousValue === null) return null;
  if (currentValue > previousValue) return 'up';
  if (currentValue < previousValue) return 'down';
  return 'same';
};

const getFirstJoinRow = <T>(value: T | T[] | null): T | null => {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
};

const getDailyRecommendationsDataCached = unstable_cache(
  async (): Promise<{ rows: DailyRow[]; errorMessage: string | null }> => {
    try {
      const supabase = createPublicClient();
      const { data, error } = await supabase
        .from('nasdaq100_recommendations_current')
        .select('score, latent_rank, confidence, bucket, updated_at, stocks(symbol, company_name)')
        .order('score', { ascending: false, nullsFirst: false })
        .order('latent_rank', { ascending: false, nullsFirst: false });

      if (error) {
        return {
          rows: [],
          errorMessage: 'Unable to load current recommendations right now.',
        };
      }

      const rows = ((data ?? []) as DailyResponseRow[])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          if (!stock?.symbol) {
            return null;
          }

          return {
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            score: typeof row.score === 'number' ? row.score : null,
            latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
            confidence: typeof row.confidence === 'number' ? row.confidence : null,
            bucket: row.bucket ?? null,
            updatedAt: row.updated_at ?? null,
          };
        })
        .filter((row): row is DailyRow => Boolean(row));

      return { rows, errorMessage: null };
    } catch {
      return { rows: [], errorMessage: null };
    }
  },
  ['platform-daily-recommendations'],
  { revalidate: 300 }
);

const getWeeklyRecommendationsDataCached = unstable_cache(
  async (): Promise<{
    rows: WeeklyRecommendationRow[];
    indexExitActions: ExitActionRow[];
    errorMessage: string | null;
  }> => {
    try {
      const supabase = createPublicClient();

      const { data: strategy, error: strategyError } = await supabase
        .from('trading_strategies')
        .select('id')
        .eq('is_default', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (strategyError || !strategy?.id) {
        return {
          rows: [],
          indexExitActions: [],
          errorMessage: 'No active strategy version found yet.',
        };
      }

      const { data: latestBatch, error: latestBatchError } = await supabase
        .from('ai_run_batches')
        .select('id, run_date')
        .eq('strategy_id', strategy.id)
        .eq('run_frequency', 'weekly')
        .order('run_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestBatchError || !latestBatch?.id) {
        return {
          rows: [],
          indexExitActions: [],
          errorMessage: 'No weekly AI run found yet.',
        };
      }

      const [analysisResponse, holdingsResponse, exitActionsResponse] = await Promise.all([
        supabase
          .from('ai_analysis_runs')
          .select('stock_id, score, latent_rank, stocks(symbol, company_name)')
          .eq('batch_id', latestBatch.id),
        supabase
          .from('strategy_portfolio_holdings')
          .select('stock_id')
          .eq('strategy_id', strategy.id)
          .eq('run_date', latestBatch.run_date),
        supabase
          .from('strategy_rebalance_actions')
          .select('symbol, action_label')
          .eq('strategy_id', strategy.id)
          .eq('run_date', latestBatch.run_date)
          .eq('action_type', 'exit_index')
          .order('symbol', { ascending: true }),
      ]);

      if (analysisResponse.error || holdingsResponse.error || exitActionsResponse.error) {
        return {
          rows: [],
          indexExitActions: [],
          errorMessage: 'Unable to load weekly rankings right now.',
        };
      }

      const top20Ids = new Set(
        (holdingsResponse.data ?? []).map((row: { stock_id: string }) => row.stock_id)
      );
      const rows = ((analysisResponse.data ?? []) as AnalysisRow[])
        .map((row) => {
          const stock = Array.isArray(row.stocks) ? row.stocks[0] : row.stocks;
          if (!stock?.symbol) {
            return null;
          }

          return {
            stockId: row.stock_id,
            symbol: stock.symbol,
            name: stock.company_name ?? stock.symbol,
            score: typeof row.score === 'number' ? row.score : null,
            latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
            isTop20: top20Ids.has(row.stock_id),
            runDate: latestBatch.run_date ?? null,
          };
        })
        .filter((row): row is WeeklyRecommendationRow => Boolean(row))
        .sort((a, b) => {
          const latentA = a.latentRank ?? -1;
          const latentB = b.latentRank ?? -1;
          if (latentA !== latentB) {
            return latentB - latentA;
          }
          const scoreA = a.score ?? -999;
          const scoreB = b.score ?? -999;
          if (scoreA !== scoreB) {
            return scoreB - scoreA;
          }
          return a.symbol.localeCompare(b.symbol);
        });

      return {
        rows,
        indexExitActions: (exitActionsResponse.data ?? []) as ExitActionRow[],
        errorMessage: null,
      };
    } catch {
      return { rows: [], indexExitActions: [], errorMessage: null };
    }
  },
  ['platform-weekly-recommendations'],
  { revalidate: 300 }
);

export const getDailyRecommendationsData = async () => getDailyRecommendationsDataCached();
export const getWeeklyRecommendationsData = async () => getWeeklyRecommendationsDataCached();

const getRatingsPageDataCached = unstable_cache(
  async (strategySlug: string | null = null): Promise<RatingsPageData> => {
    try {
      const supabase = createAdminClient();

      let strategyQuery = supabase
        .from('trading_strategies')
        .select('id, slug, name, is_default')
        .limit(1);

      if (strategySlug) {
        strategyQuery = strategyQuery.eq('slug', strategySlug);
      } else {
        strategyQuery = strategyQuery.eq('is_default', true).order('created_at', { ascending: false });
      }

      const { data: strategy, error: strategyError } = await strategyQuery.maybeSingle<RatingsStrategyRow>();

      if (strategyError || !strategy) {
        return {
          rows: [],
          errorMessage: 'No strategy version is available yet.',
          strategy: null,
          latestRunDate: null,
        };
      }

      const { data: batches, error: batchError } = await supabase
        .from('ai_run_batches')
        .select('id, run_date')
        .eq('strategy_id', strategy.id)
        .eq('run_frequency', 'weekly')
        .order('run_date', { ascending: false })
        .limit(4);

      if (batchError || !batches?.length) {
        return {
          rows: [],
          errorMessage: 'No weekly AI runs are available yet.',
          strategy: {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            isDefault: strategy.is_default,
          },
          latestRunDate: null,
        };
      }

      const latestBatch = batches[0];
      const latestRunDate = latestBatch.run_date ?? null;
      const batchIds = batches.map((batch) => batch.id);

      const previousBatch = batches[1] ?? null;
      const comparisonBatchIds = previousBatch ? [latestBatch.id, previousBatch.id] : [latestBatch.id];

      const [baseResponse, holdingsResponse, batchScoresResponse, rankingHistoryResponse, latestPriceDateResponse] =
        await Promise.all([
        strategy.is_default && !strategySlug
          ? supabase
              .from('nasdaq100_recommendations_current')
              .select(
                'stock_id, score, latent_rank, score_delta, bucket, reason_1s, updated_at, stocks(symbol, company_name)'
              )
          : supabase
              .from('ai_analysis_runs')
              .select(
                'stock_id, score, latent_rank, score_delta, bucket, reason_1s, created_at, stocks(symbol, company_name)'
              )
              .eq('batch_id', latestBatch.id),
        supabase
          .from('strategy_portfolio_holdings')
          .select('stock_id')
          .eq('strategy_id', strategy.id)
          .eq('run_date', latestRunDate),
        supabase
          .from('ai_analysis_runs')
          .select('stock_id, batch_id, score')
          .in('batch_id', batchIds),
        supabase
          .from('ai_analysis_runs')
          .select('stock_id, batch_id, score, latent_rank, bucket')
          .in('batch_id', comparisonBatchIds),
        supabase
          .from('nasdaq_100_daily_raw')
          .select('run_date')
          .order('run_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (baseResponse.error || holdingsResponse.error || batchScoresResponse.error || rankingHistoryResponse.error) {
        return {
          rows: [],
          errorMessage: "Unable to load this week's ratings right now.",
          strategy: {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            isDefault: strategy.is_default,
          },
          latestRunDate,
        };
      }

      let latestPriceRows: LatestPriceRow[] = [];
      const latestPriceDate = latestPriceDateResponse.data?.run_date ?? null;

      if (latestPriceDate) {
        const { data: priceRows } = await supabase
          .from('nasdaq_100_daily_raw')
          .select('symbol, last_sale_price, run_date')
          .eq('run_date', latestPriceDate);

        latestPriceRows = (priceRows ?? []) as LatestPriceRow[];
      }

      const isTop20Ids = new Set((holdingsResponse.data ?? []).map((row: { stock_id: string }) => row.stock_id));
      const priceMap = new Map(
        latestPriceRows.map((row) => [
          row.symbol.toUpperCase(),
          { lastPrice: row.last_sale_price ?? null, priceDate: row.run_date ?? null },
        ])
      );
      const avgScoreMap = new Map<string, number | null>();

      const batchScoresByStock = new Map<string, number[]>();
      ((batchScoresResponse.data ?? []) as BatchScoreRow[]).forEach((row) => {
        if (typeof row.score !== 'number') {
          return;
        }
        const existing = batchScoresByStock.get(row.stock_id) ?? [];
        existing.push(row.score);
        batchScoresByStock.set(row.stock_id, existing);
      });
      batchScoresByStock.forEach((scores, stockId) => {
        avgScoreMap.set(stockId, averageScores(scores));
      });

      const baseRows: RatingsBaseRow[] = (
        strategy.is_default && !strategySlug
          ? ((baseResponse.data ?? []) as CurrentRecommendationRow[]).map((row) => {
              const stock = getFirstJoinRow(row.stocks);
              if (!stock?.symbol) {
                return null;
              }

              return {
                stockId: row.stock_id,
                symbol: stock.symbol,
                name: stock.company_name ?? stock.symbol,
                score: typeof row.score === 'number' ? row.score : null,
                latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
                bucket: row.bucket ?? null,
                reason1s: row.reason_1s ?? null,
                updatedAt: row.updated_at ?? null,
              };
            })
          : ((baseResponse.data ?? []) as StrategyAnalysisRow[]).map((row) => {
              const stock = getFirstJoinRow(row.stocks);
              if (!stock?.symbol) {
                return null;
              }

              return {
                stockId: row.stock_id,
                symbol: stock.symbol,
                name: stock.company_name ?? stock.symbol,
                score: typeof row.score === 'number' ? row.score : null,
                latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
                bucket: row.bucket ?? null,
                reason1s: row.reason_1s ?? null,
                updatedAt: row.created_at ?? latestRunDate,
              };
            })
      ).filter((row): row is RatingsBaseRow => Boolean(row));

      const rankingRows = (rankingHistoryResponse.data ?? []) as BatchRankingRow[];
      const latestRankingRows = rankingRows.filter((row) => row.batch_id === latestBatch.id);
      const previousRankingRows = previousBatch
        ? rankingRows.filter((row) => row.batch_id === previousBatch.id)
        : [];
      const previousRankMap = buildRankMap(previousRankingRows);
      const previousBucketMap = new Map(previousRankingRows.map((row) => [row.stock_id, row.bucket]));

      const rankedRows = assignRanks(baseRows).map(({ row, rank }) => {
        const avgScore4w = avgScoreMap.get(row.stockId) ?? null;
        const latestPrice = priceMap.get(row.symbol.toUpperCase());
        const previousRank = previousRankMap.get(row.stockId) ?? null;
        const rankChange = previousRank === null ? null : previousRank - rank;
        const bucketChange = getBucketChange(row.bucket, previousBucketMap.get(row.stockId) ?? null);

        return {
          stockId: row.stockId,
          symbol: row.symbol,
          name: row.name,
          score: row.score,
          rank,
          bucket: row.bucket,
          rankChange,
          bucketChange,
          avgScore4w,
          avgBucket4w: bucketFromScore(avgScore4w),
          reason1s: row.reason1s,
          lastPrice: latestPrice?.lastPrice ?? null,
          priceDate: latestPrice?.priceDate ?? null,
          isTop20: isTop20Ids.has(row.stockId),
          updatedAt: row.updatedAt,
        } satisfies RatingsRow;
      });

      return {
        rows: rankedRows,
        errorMessage: null,
        strategy: {
          id: strategy.id,
          slug: strategy.slug,
          name: strategy.name,
          isDefault: strategy.is_default,
        },
        latestRunDate,
      };
    } catch {
      return {
        rows: [],
        errorMessage: "Unable to load this week's ratings right now.",
        strategy: null,
        latestRunDate: null,
      };
    }
  },
  ['platform-ratings-page'],
  { revalidate: 300 }
);

export const getRatingsPageData = async (strategySlug?: string | null) =>
  getRatingsPageDataCached(strategySlug ?? null);
