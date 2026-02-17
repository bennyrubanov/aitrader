import { unstable_cache } from 'next/cache';
import { allStocks } from '@/lib/stockData';
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
      return {
        rows: allStocks.map((stock) => ({
          symbol: stock.symbol,
          name: stock.name,
          score: null,
          latentRank: null,
          confidence: null,
          bucket: null,
          updatedAt: null,
        })),
        errorMessage: null,
      };
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
      return {
        rows: allStocks.map((stock) => ({
          stockId: stock.symbol,
          symbol: stock.symbol,
          name: stock.name,
          score: null,
          latentRank: null,
          isTop20: false,
          runDate: null,
        })),
        indexExitActions: [],
        errorMessage: null,
      };
    }
  },
  ['platform-weekly-recommendations'],
  { revalidate: 300 }
);

export const getDailyRecommendationsData = async () => getDailyRecommendationsDataCached();
export const getWeeklyRecommendationsData = async () => getWeeklyRecommendationsDataCached();
