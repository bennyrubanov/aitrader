import { unstable_cache } from 'next/cache';
import type { RecommendationBucket } from '@/lib/recommendation-bucket';
import { bucketFromScore } from '@/lib/recommendation-bucket';
import { createAdminClient } from '@/utils/supabase/admin';

export type { RecommendationBucket };

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
  /** `current_score - previous_score` from the latest AI run vs prior week. */
  scoreDelta: number | null;
  rank: number;
  bucket: RecommendationBucket;
  rankChange: number | null;
  bucketChange: 'up' | 'down' | 'same' | null;
  avgScore4w: number | null;
  avgBucket4w: RecommendationBucket;
  reason1s: string | null;
  /** Short risk strings from AI output (`ai_analysis_runs.risks` / current recommendations). */
  risks: string[];
  lastPrice: string | null;
  priceDate: string | null;
  isTop20: boolean;
  updatedAt: string | null;
  /**
   * Mean weekly AI score from the first ratings run for this model through the selected run week
   * (same universe as ratings).
   */
  cumulativeAvgScore: number | null;
  /** Rank by `cumulativeAvgScore` (1 = highest) among stocks in this run. */
  cumulativeViewRank: number;
  /** Prior cumulative-view rank minus current; positive means moved up the cumulative leaderboard. */
  cumulativeRankChange: number | null;
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
  availableRunDates: string[];
  /** First weekly AI ratings `run_date` for this strategy (start of cumulative average). */
  modelInceptionDate: string | null;
  /** Workspace/API: guest shell, free-tier partial list, or full paid ratings. */
  ratingsAccessMode?: 'guest' | 'free' | 'full';
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
  risks: unknown;
  updated_at: string | null;
  stocks:
    | { symbol: string; company_name: string | null; is_premium_stock?: boolean }
    | { symbol: string; company_name: string | null; is_premium_stock?: boolean }[]
    | null;
};

type StrategyAnalysisRow = {
  stock_id: string;
  score: number | null;
  latent_rank: number | null;
  score_delta: number | null;
  bucket: RecommendationBucket;
  reason_1s: string | null;
  risks: unknown;
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
  scoreDelta: number | null;
  latentRank: number | null;
  bucket: RecommendationBucket;
  reason1s: string | null;
  risks: string[];
  updatedAt: string | null;
};

const parseRisksFromJson = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
};

type BatchRankingRow = {
  stock_id: string;
  batch_id: string;
  score: number | null;
  latent_rank: number | null;
  bucket: RecommendationBucket;
};

const averageScores = (scores: number[]) => {
  if (!scores.length) {
    return null;
  }

  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return Number(average.toFixed(2));
};

const ANALYSIS_RUNS_BATCH_CHUNK = 80;

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function loadCumulativeAverageScoresByStock(
  supabase: ReturnType<typeof createAdminClient>,
  batchIds: string[]
): Promise<Map<string, number>> {
  const totals = new Map<string, { sum: number; n: number }>();
  if (!batchIds.length) {
    return new Map();
  }
  for (const idChunk of chunkIds(batchIds, ANALYSIS_RUNS_BATCH_CHUNK)) {
    const { data: runs } = await supabase
      .from('ai_analysis_runs')
      .select('stock_id, score')
      .in('batch_id', idChunk);
    for (const r of runs ?? []) {
      if (typeof r.score !== 'number') {
        continue;
      }
      const t = totals.get(r.stock_id) ?? { sum: 0, n: 0 };
      t.sum += r.score;
      t.n += 1;
      totals.set(r.stock_id, t);
    }
  }
  const out = new Map<string, number>();
  totals.forEach((v, k) => {
    if (v.n > 0) {
      out.set(k, Number((v.sum / v.n).toFixed(2)));
    }
  });
  return out;
}

/** Dense ranks 1..n by cumulative average (desc); missing averages sort last. */
function assignCumulativeViewRankMap(
  rows: Array<{ stockId: string; symbol: string }>,
  avgByStock: Map<string, number>
): Map<string, number> {
  const sorted = [...rows].sort((a, b) => {
    const va = avgByStock.get(a.stockId);
    const vb = avgByStock.get(b.stockId);
    const aHas = va !== undefined;
    const bHas = vb !== undefined;
    if (!aHas && !bHas) {
      return a.symbol.localeCompare(b.symbol) || a.stockId.localeCompare(b.stockId);
    }
    if (!aHas) return 1;
    if (!bHas) return -1;
    if (vb !== va) return vb - va;
    return a.symbol.localeCompare(b.symbol) || a.stockId.localeCompare(b.stockId);
  });
  const out = new Map<string, number>();
  sorted.forEach((r, i) => out.set(r.stockId, i + 1));
  return out;
}

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

const getWeeklyRecommendationsDataCached = unstable_cache(
  async (): Promise<{
    rows: WeeklyRecommendationRow[];
    indexExitActions: ExitActionRow[];
    errorMessage: string | null;
  }> => {
    try {
      const supabase = createAdminClient();

      const { data: strategy, error: strategyError } = await supabase
        .from('strategy_models')
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

export const getWeeklyRecommendationsData = async () => getWeeklyRecommendationsDataCached();

export function ratingsPageDataGuestShell(): RatingsPageData {
  return {
    rows: [],
    errorMessage: null,
    strategy: null,
    latestRunDate: null,
    availableRunDates: [],
    modelInceptionDate: null,
    ratingsAccessMode: 'guest',
  };
}

async function loadRatingsPageData(
  strategySlug: string | null,
  runDate: string | null,
  options?: { freeTierNonPremiumOnly?: boolean }
): Promise<RatingsPageData> {
  try {
      const freeOnly = Boolean(options?.freeTierNonPremiumOnly);
      if (freeOnly && strategySlug) {
        return {
          rows: [],
          errorMessage: 'Upgrade your plan to view ratings for other strategy models.',
          strategy: null,
          latestRunDate: null,
          availableRunDates: [],
          modelInceptionDate: null,
          ratingsAccessMode: 'free',
        };
      }

      const supabase = createAdminClient();

      let strategyQuery = supabase
        .from('strategy_models')
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
          availableRunDates: [],
          modelInceptionDate: null,
          ratingsAccessMode: freeOnly ? 'free' : 'full',
        };
      }

      const { data: allBatches, error: allBatchError } = await supabase
        .from('ai_run_batches')
        .select('id, run_date')
        .eq('strategy_id', strategy.id)
        .eq('run_frequency', 'weekly')
        .order('run_date', { ascending: false });

      if (allBatchError || !allBatches?.length) {
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
          availableRunDates: [],
          modelInceptionDate: null,
          ratingsAccessMode: freeOnly ? 'free' : 'full',
        };
      }

      const availableRunDates = allBatches.map((b) => b.run_date).filter(Boolean) as string[];

      const dateFilter = freeOnly ? null : runDate;
      const selectedBatch = dateFilter
        ? allBatches.find((b) => b.run_date === dateFilter) ?? allBatches[0]
        : allBatches[0];
      const selectedIdx = allBatches.findIndex((b) => b.id === selectedBatch.id);
      const latestRunDate = selectedBatch.run_date ?? null;

      const contextBatches = allBatches.slice(selectedIdx, selectedIdx + 4);
      const batchIds = contextBatches.map((batch) => batch.id);

      const previousBatch = contextBatches[1] ?? null;
      const comparisonBatchIds = previousBatch ? [selectedBatch.id, previousBatch.id] : [selectedBatch.id];

      const isLatestRun = selectedBatch.id === allBatches[0].id;

      const modelInceptionDate =
        allBatches.length > 0 ? (allBatches[allBatches.length - 1]!.run_date ?? null) : null;

      const batchIdsCumulativeThroughSelected = allBatches.slice(selectedIdx).map((b) => b.id);
      const batchIdsCumulativeThroughPrevious =
        previousBatch != null ? allBatches.slice(selectedIdx + 1).map((b) => b.id) : [];

      const [
        cumulativeAvgByStock,
        cumulativeAvgPreviousByStock,
        baseResponse,
        holdingsResponse,
        batchScoresResponse,
        rankingHistoryResponse,
        latestPriceDateResponse,
      ] = await Promise.all([
        loadCumulativeAverageScoresByStock(supabase, batchIdsCumulativeThroughSelected),
        batchIdsCumulativeThroughPrevious.length > 0
          ? loadCumulativeAverageScoresByStock(supabase, batchIdsCumulativeThroughPrevious)
          : Promise.resolve(new Map<string, number>()),
        strategy.is_default && !strategySlug && isLatestRun
          ? supabase
              .from(freeOnly ? 'nasdaq100_recommendations_current_public' : 'nasdaq100_recommendations_current')
              .select(
                freeOnly
                  ? 'stock_id, score, score_delta, bucket, reason_1s, risks, updated_at, stocks(symbol, company_name, is_premium_stock)'
                  : 'stock_id, score, latent_rank, score_delta, bucket, reason_1s, risks, updated_at, stocks(symbol, company_name)'
              )
          : supabase
              .from('ai_analysis_runs')
              .select(
                'stock_id, score, latent_rank, score_delta, bucket, reason_1s, risks, created_at, stocks(symbol, company_name)'
              )
              .eq('batch_id', selectedBatch.id),
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
          errorMessage: 'Unable to load stock ratings right now.',
          strategy: {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            isDefault: strategy.is_default,
          },
          latestRunDate,
          availableRunDates,
          modelInceptionDate,
          ratingsAccessMode: freeOnly ? 'free' : 'full',
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
        strategy.is_default && !strategySlug && isLatestRun
          ? ((baseResponse.data ?? []) as unknown as CurrentRecommendationRow[]).map((row) => {
              const stock = getFirstJoinRow(row.stocks);
              if (!stock?.symbol) {
                return null;
              }
              if (freeOnly && stock.is_premium_stock === true) {
                return null;
              }

              return {
                stockId: row.stock_id,
                symbol: stock.symbol,
                name: stock.company_name ?? stock.symbol,
                score: typeof row.score === 'number' ? row.score : null,
                scoreDelta: typeof row.score_delta === 'number' ? row.score_delta : null,
                latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
                bucket: row.bucket ?? null,
                reason1s: row.reason_1s ?? null,
                risks: parseRisksFromJson(row.risks),
                updatedAt: row.updated_at ?? null,
              };
            })
          : ((baseResponse.data ?? []) as unknown as StrategyAnalysisRow[]).map((row) => {
              const stock = getFirstJoinRow(row.stocks);
              if (!stock?.symbol) {
                return null;
              }

              return {
                stockId: row.stock_id,
                symbol: stock.symbol,
                name: stock.company_name ?? stock.symbol,
                score: typeof row.score === 'number' ? row.score : null,
                scoreDelta: typeof row.score_delta === 'number' ? row.score_delta : null,
                latentRank: typeof row.latent_rank === 'number' ? row.latent_rank : null,
                bucket: row.bucket ?? null,
                reason1s: row.reason_1s ?? null,
                risks: parseRisksFromJson(row.risks),
                updatedAt: row.created_at ?? latestRunDate,
              };
            })
      ).filter((row): row is RatingsBaseRow => Boolean(row));

      if (freeOnly && !(strategy.is_default && !strategySlug && isLatestRun)) {
        return {
          rows: [],
          errorMessage: 'Free tier ratings are only available for the latest default model run.',
          strategy: {
            id: strategy.id,
            slug: strategy.slug,
            name: strategy.name,
            isDefault: strategy.is_default,
          },
          latestRunDate,
          availableRunDates: latestRunDate ? [latestRunDate] : [],
          modelInceptionDate,
          ratingsAccessMode: 'free',
        };
      }

      const rankMeta = baseRows.map((r) => ({ stockId: r.stockId, symbol: r.symbol }));
      const cumulativeRankSelMap = assignCumulativeViewRankMap(rankMeta, cumulativeAvgByStock);
      const cumulativeRankPrevMap =
        batchIdsCumulativeThroughPrevious.length > 0
          ? assignCumulativeViewRankMap(rankMeta, cumulativeAvgPreviousByStock)
          : null;

      const rankingRows = (rankingHistoryResponse.data ?? []) as BatchRankingRow[];
      const previousRankingRows = previousBatch
        ? rankingRows.filter((row) => row.batch_id === previousBatch.id)
        : [];
      const previousRankMap = buildRankMap(previousRankingRows);
      const previousBucketMap = new Map(previousRankingRows.map((row) => [row.stock_id, row.bucket]));

      const rankedRows: RatingsRow[] = freeOnly
        ? [...baseRows]
            .sort((a, b) => a.symbol.localeCompare(b.symbol))
            .map((row) => {
              const avgScore4w = avgScoreMap.get(row.stockId) ?? null;
              const latestPrice = priceMap.get(row.symbol.toUpperCase());
              const bucketChange = getBucketChange(row.bucket, previousBucketMap.get(row.stockId) ?? null);
              return {
                stockId: row.stockId,
                symbol: row.symbol,
                name: row.name,
                score: row.score,
                scoreDelta: row.scoreDelta,
                rank: 0,
                bucket: row.bucket,
                rankChange: null,
                bucketChange,
                avgScore4w,
                avgBucket4w: bucketFromScore(avgScore4w),
                reason1s: row.reason1s,
                risks: row.risks,
                lastPrice: latestPrice?.lastPrice ?? null,
                priceDate: latestPrice?.priceDate ?? null,
                isTop20: isTop20Ids.has(row.stockId),
                updatedAt: row.updatedAt,
                cumulativeAvgScore: cumulativeAvgByStock.get(row.stockId) ?? null,
                cumulativeViewRank: 0,
                cumulativeRankChange: null,
              } satisfies RatingsRow;
            })
        : assignRanks(baseRows).map(({ row, rank }) => {
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
              scoreDelta: row.scoreDelta,
              rank,
              bucket: row.bucket,
              rankChange,
              bucketChange,
              avgScore4w,
              avgBucket4w: bucketFromScore(avgScore4w),
              reason1s: row.reason1s,
              risks: row.risks,
              lastPrice: latestPrice?.lastPrice ?? null,
              priceDate: latestPrice?.priceDate ?? null,
              isTop20: isTop20Ids.has(row.stockId),
              updatedAt: row.updatedAt,
              cumulativeAvgScore: cumulativeAvgByStock.get(row.stockId) ?? null,
              cumulativeViewRank: cumulativeRankSelMap.get(row.stockId) ?? 1,
              cumulativeRankChange:
                cumulativeRankPrevMap == null
                  ? null
                  : (cumulativeRankPrevMap.get(row.stockId) ?? 1) -
                    (cumulativeRankSelMap.get(row.stockId) ?? 1),
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
        availableRunDates: freeOnly && latestRunDate ? [latestRunDate] : availableRunDates,
        modelInceptionDate,
        ratingsAccessMode: freeOnly ? 'free' : 'full',
      };
    } catch {
      return {
        rows: [],
        errorMessage: 'Unable to load stock ratings right now.',
        strategy: null,
        latestRunDate: null,
        availableRunDates: [],
        modelInceptionDate: null,
        ratingsAccessMode: options?.freeTierNonPremiumOnly ? 'free' : 'full',
      };
    }
}

export const getRatingsPageData = async (
  strategySlug?: string | null,
  runDate?: string | null
): Promise<RatingsPageData> => {
  const slug = strategySlug ?? null;
  const date = runDate ?? null;
  return unstable_cache(
    async () => loadRatingsPageData(slug, date),
    ['platform-ratings-page', slug ?? 'default', date ?? 'latest'],
    { revalidate: 300 }
  )();
};

/** Signed-in free tier: latest default-model rows for non-premium stocks only; no rankings in payload/UI. */
export const getRatingsPageDataFreeTier = async (): Promise<RatingsPageData> =>
  unstable_cache(
    async () => loadRatingsPageData(null, null, { freeTierNonPremiumOnly: true }),
    ['platform-ratings-page-free-tier'],
    { revalidate: 300 }
  )();
