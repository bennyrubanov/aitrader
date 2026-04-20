import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  buildStockRatingPrompt,
  STOCK_RATING_PROMPT_TEMPLATE,
  StockRatingSchema,
  type StockRatingParsed,
} from '@/lib/aiPrompt';
import { LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG } from '@/lib/landing-top-portfolio-performance';
import { RANKED_CONFIGS_CACHE_TAG } from '@/lib/portfolio-configs-ranked-core';
import { STRATEGY_CONFIG, GIT_COMMIT_SHA } from '@/lib/strategyConfig';
import {
  INITIAL_CAPITAL,
  computeSimpleReturn,
  fetchBenchmarkReturnDetail,
  getDateLagDetail,
  shouldWarnForStaleBenchmarkBar,
  STOOQ_BENCHMARK_SYMBOLS,
  STOOQ_STALE_WARNING_MAX_CALENDAR_DAYS,
  STOOQ_STALE_WARNING_MAX_WEEKDAY_DAYS,
  type BenchmarkReturnDetail,
} from '@/lib/stooq-benchmark-weekly';
import {
  upsertBenchmarkDailyPricesFromStooq,
  type BenchmarkDailyPriceIngestRow,
} from '@/lib/benchmark-daily-prices-ingest';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendEmailByGmail } from '@/lib/sendEmailByGmail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NASDAQ_100_ENDPOINT = 'https://api.nasdaq.com/api/quote/list-type/nasdaq100';
const CRON_ERROR_EMAIL = process.env.CRON_ERROR_EMAIL;
const CRON_TIMEOUT_SECONDS = Number(process.env.CRON_TIMEOUT_SECONDS || 300);
const CRON_TIMEOUT_WARNING_BUFFER_SECONDS = Number(
  process.env.CRON_TIMEOUT_WARNING_BUFFER_SECONDS || 25
);
type NasdaqRow = {
  symbol: string;
  companyName?: string;
  marketCap?: string;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  deltaIndicator?: string;
};

type StockRow = {
  id: string;
  symbol: string;
  company_name: string | null;
};

type MemberRow = {
  stock_id: string;
  stocks: StockRow | StockRow[] | null;
};

type PreviousRun = {
  stock_id: string;
  score: number;
  bucket: 'buy' | 'hold' | 'sell';
};

type WebSource = {
  url?: string;
  link?: string;
  title?: string;
  source?: string;
  snippet?: string;
};

type Citation = {
  url: string;
  title: string | null;
};

type UrlLike = {
  url?: string;
  link?: string;
};

type JsonRecord = Record<string, unknown>;

type CronErrorEntry = {
  subject: string;
  context?: string;
  message: string;
  at: string;
};

type CronRatingDigestMeta = {
  forceRun?: boolean;
  runMode?: 'rating_day' | 'prices_only';
  nasdaqSource?: 'api' | 'fallback';
  nasdaqSymbolCount?: number;
  /** Rows written to `stocks` this run. */
  stocksRowsUpserted?: number;
  /** Rows written to `nasdaq_100_daily_raw` this run */
  nasdaqRawRowsUpserted?: number;
  /** Symbols where `lastSalePrice` parsed to a finite number (API quote quality) */
  nasdaqSymbolsWithParsedPrice?: number;
  strategySlug?: string;
  strategyName?: string;
  strategyVersion?: string;
  indexName?: string;
  modelName?: string;
  promptVersion?: string;
  batchId?: string;
  snapshotIsNew?: boolean;
  snapshotMembers?: number;
  aiConcurrency?: number;
  aiOk?: number;
  aiFailed?: number;
  aiMissing?: number;
  turnover?: number;
  netReturn?: number;
  grossReturn?: number;
  rebalanceActionsCount?: number;
  sequenceNumber?: number;
  portfolioConfigBatchTriggered?: boolean;
  portfolioConfigsComputed?: number;
  portfolioConfigsFailed?: number;
  benchmarkNasdaqCap?: number;
  benchmarkNasdaqEqual?: number;
  benchmarkSp500?: number;
  /** Compact Stooq CSV detail string used in logs/API output. */
  benchmarkStooqDetail?: string;
  /** Human-readable Stooq symbol lines for email rendering. */
  benchmarkStooqLines?: string[];
  /** Benchmark data-quality criteria used to evaluate staleness warnings. */
  benchmarkStooqCriteria?: string;
  /** Equal-weight benchmark quality summary for keep/switch decisions. */
  benchmarkEqualProxyQuality?: string;
  /** Stooq (primary) / Yahoo (fallback) → `benchmark_daily_prices` upsert summary (weekday step after raw quotes). */
  benchmarkDailyPricesIngest?: BenchmarkDailyPriceIngestRow[];
  /** Top holdings count written to `strategy_portfolio_holdings`. */
  holdingsCount?: number;
};

type StrategyRow = {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string | null;
  ait_code: string | null;
  robot_name: string | null;
  index_name: string;
  rebalance_frequency: string;
  rebalance_day_of_week: number;
  portfolio_size: number;
  weighting_method: string;
  transaction_cost_bps: number | string;
  prompt_id: string;
  model_id: string;
  status: string;
};

type BatchRow = {
  id: string;
  run_date: string;
};

type HoldingRow = {
  stock_id: string;
  symbol: string;
  target_weight: number;
};

type PerformanceRow = {
  run_date: string;
  sequence_number: number;
  ending_equity: number | string;
  nasdaq100_cap_weight_equity: number | string;
  nasdaq100_equal_weight_equity: number | string;
  sp500_equity: number | string;
};

type RebalanceActionRow = {
  stock_id: string;
  symbol: string;
  action_type: 'enter' | 'exit_rank' | 'exit_index';
  action_label: string;
  previous_weight: number | null;
  new_weight: number | null;
};

type BatchScoreRow = {
  stock_id: string;
  symbol: string;
  score: number;
  latent_rank: number;
};

type ForwardSample = {
  stock_id: string;
  symbol: string;
  score: number;
  latent_rank: number;
  forward_return: number;
};

type AiProcessResult =
  | {
      status: 'missing_stock';
      stock_id: string;
    }
  | {
      status: 'ok' | 'failed';
      stock_id: string;
      symbol: string;
      company_name: string | null;
      score: number;
      latent_rank: number;
      confidence: number;
      bucket: 'buy' | 'hold' | 'sell';
      error?: string;
    };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const firstRelation = <T>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

const toOptionalString = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toNullableNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const getRunDate = () => new Date().toISOString().slice(0, 10);

const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getUtcWeekday = (dateString: string) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.getUTCDay();
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatSectionSeconds = (startMs: number | null, endMs: number | null) => {
  if (
    startMs === null ||
    endMs === null ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs < startMs
  ) {
    return 'unavailable';
  }
  return `${((endMs - startMs) / 1000).toFixed(1)}s`;
};

const sendEmailWithRetry = async (
  email: string,
  htmlBody: string,
  subject: string,
  maxAttempts = 4
) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ok = await sendEmailByGmail(email, htmlBody, subject);
    if (ok) {
      return true;
    }
    if (attempt < maxAttempts) {
      const delayMs = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
      await sleep(delayMs);
    }
  }
  return false;
};

const isAuthorized = (req: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, reason: 'CRON_SECRET is not configured.' };
  }

  const headerToken =
    req.headers.get('x-cron-secret') ||
    req.headers.get('x-vercel-cron-secret') ||
    (req.headers.get('authorization') || '').replace('Bearer ', '');
  const queryToken = new URL(req.url).searchParams.get('secret');
  const token = headerToken || queryToken;

  if (token !== secret) {
    return { ok: false, status: 401, reason: 'Unauthorized.' };
  }

  return { ok: true };
};

const parsePrice = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }
  const normalized = value
    .replaceAll('$', '')
    .replaceAll('%', '')
    .replaceAll(',', '')
    .replaceAll(' ', '')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseNasdaqRows = (payload: unknown): NasdaqRow[] => {
  const rows =
    isRecord(payload) && isRecord(payload.data) && isRecord(payload.data.data)
      ? payload.data.data.rows
      : null;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      if (!isRecord(row)) {
        return null;
      }
      const symbol = toOptionalString(row.symbol);
      const parsedRow: NasdaqRow = { symbol: symbol || '' };
      const companyName = toOptionalString(row.companyName);
      const marketCap = toOptionalString(row.marketCap);
      const lastSalePrice = toOptionalString(row.lastSalePrice);
      const netChange = toOptionalString(row.netChange);
      const percentageChange = toOptionalString(row.percentageChange);
      const deltaIndicator = toOptionalString(row.deltaIndicator);

      if (companyName) {
        parsedRow.companyName = companyName;
      }
      if (marketCap) {
        parsedRow.marketCap = marketCap;
      }
      if (lastSalePrice) {
        parsedRow.lastSalePrice = lastSalePrice;
      }
      if (netChange) {
        parsedRow.netChange = netChange;
      }
      if (percentageChange) {
        parsedRow.percentageChange = percentageChange;
      }
      if (deltaIndicator) {
        parsedRow.deltaIndicator = deltaIndicator;
      }

      return parsedRow;
    })
    .filter((row): row is NasdaqRow => Boolean(row && row.symbol));
};

const fetchNasdaq100 = async (): Promise<NasdaqRow[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(NASDAQ_100_ENDPOINT, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Nasdaq API error: ${response.status}`);
    }

    const payload = await response.json();
    return parseNasdaqRows(payload);
  } finally {
    clearTimeout(timeout);
  }
};

const bucketFromScore = (score: number) => {
  if (score >= 2) {
    return 'buy';
  }
  if (score <= -2) {
    return 'sell';
  }
  return 'hold';
};

const clampScore = (score: number) => {
  if (Number.isNaN(score)) {
    return 0;
  }
  return Math.max(-5, Math.min(5, Math.round(score)));
};

const clampConfidence = (confidence: number) => {
  if (Number.isNaN(confidence)) {
    return 0;
  }
  return Math.max(0, Math.min(1, confidence));
};

const clampLatentRank = (latentRank: number) => {
  if (Number.isNaN(latentRank)) {
    return 0.5;
  }
  return Math.max(0, Math.min(1, latentRank));
};

const normalizeWebSource = (value: unknown): WebSource | null => {
  if (!isRecord(value)) {
    return null;
  }

  const url = isString(value.url) ? value.url : undefined;
  const link = isString(value.link) ? value.link : undefined;
  if (!url && !link) {
    return null;
  }

  return {
    url,
    link,
    title: isString(value.title) ? value.title : undefined,
    source: isString(value.source) ? value.source : undefined,
    snippet: isString(value.snippet) ? value.snippet : undefined,
  };
};

const uniqueByUrl = <T extends UrlLike>(items: T[]) => {
  const map = new Map<string, T>();
  items.forEach((item) => {
    const url = item.url || item.link;
    if (!url) {
      return;
    }
    if (!map.has(url)) {
      map.set(url, item);
    }
  });
  return Array.from(map.values());
};

const extractStructuredOutput = (payload: unknown) => {
  if (isRecord(payload)) {
    const status = payload.status;
    const incomplete = payload.incomplete_details;
    if (status === 'incomplete' && isRecord(incomplete) && isString(incomplete.reason)) {
      throw new Error(`OpenAI response incomplete: ${incomplete.reason}`);
    }
  }

  if (isRecord(payload) && isString(payload.output_text)) {
    return { text: payload.output_text.trim(), refusal: null };
  }

  const output = isRecord(payload) ? payload.output : null;
  if (!Array.isArray(output)) {
    return { text: '', refusal: null };
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const contentItem of item.content) {
      if (!isRecord(contentItem) || !isString(contentItem.type)) {
        continue;
      }
      if (contentItem.type === 'refusal' && isString(contentItem.refusal)) {
        return { text: '', refusal: contentItem.refusal };
      }
      if (contentItem.type === 'output_text' && isString(contentItem.text)) {
        chunks.push(contentItem.text);
      }
    }
  }

  return { text: chunks.join('\n').trim(), refusal: null };
};

const parseStructuredOutput = <T>(outputText: string): T => {
  const trimmed = outputText.trim();
  if (!trimmed) {
    throw new Error('OpenAI response missing output_text');
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      return JSON.parse(sliced) as T;
    }
    const message = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`Failed to parse JSON output: ${message}`);
  }
};

const extractSourcesAndCitations = (payload: unknown) => {
  const sources: WebSource[] = [];
  const citations: Citation[] = [];
  const output = isRecord(payload) ? payload.output : null;

  if (Array.isArray(output)) {
    output.forEach((item) => {
      if (isRecord(item) && item.type === 'web_search_call' && isRecord(item.action)) {
        const actionSources = item.action.sources;
        if (Array.isArray(actionSources)) {
          actionSources.forEach((source) => {
            const normalized = normalizeWebSource(source);
            if (normalized) {
              sources.push(normalized);
            }
          });
        }
      }

      if (isRecord(item) && Array.isArray(item.content)) {
        item.content.forEach((contentItem) => {
          if (!isRecord(contentItem) || !Array.isArray(contentItem.annotations)) {
            return;
          }
          contentItem.annotations.forEach((annotation) => {
            if (!isRecord(annotation) || !isString(annotation.url)) {
              return;
            }
            const titleValue = annotation.title || annotation.text || null;
            const title = isString(titleValue) ? titleValue : null;
            citations.push({
              url: annotation.url,
              title,
            });
          });
        });
      }
    });
  }

  const normalizedSources = uniqueByUrl(sources);
  const citationFromSources = normalizedSources
    .map((source) => {
      const url = source.url || source.link;
      if (!url) {
        return null;
      }
      return {
        url,
        title: source.title || source.source || source.snippet || null,
      };
    })
    .filter((citation): citation is Citation => Boolean(citation));

  return {
    sources: normalizedSources,
    citations: uniqueByUrl([...citations, ...citationFromSources]),
  };
};

const requestStockRating = async (prompt: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const client = new OpenAI({ apiKey });
  const payload = await client.responses.parse({
    model: STRATEGY_CONFIG.model.name,
    temperature: 0.2,
    max_output_tokens: 800,
    tools: [{ type: 'web_search' }],
    tool_choice: { type: 'web_search' },
    include: ['web_search_call.action.sources'],
    input: [
      {
        role: 'system',
        content: 'Use exactly one web_search call. Output only JSON matching the schema.',
      },
      { role: 'user', content: prompt },
    ],
    text: {
      format: zodTextFormat(StockRatingSchema, 'stock_rating'),
    },
  } as unknown as Parameters<typeof client.responses.parse>[0]);

  const { text: outputText, refusal } = extractStructuredOutput(payload);
  if (refusal) {
    throw new Error(`OpenAI refusal: ${refusal}`);
  }

  const parsed = payload.output_parsed ?? parseStructuredOutput<StockRatingParsed>(outputText);
  const { sources, citations } = extractSourcesAndCitations(payload);
  return { parsed, sources, citations, raw: payload };
};

const chunkWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<R>
) => {
  const queue = [...items];
  const results: R[] = [];
  const workerCount = Math.max(1, concurrency);

  const workers = Array.from({ length: workerCount }).map(async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) {
        return;
      }
      const result = await handler(next);
      results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
};

const upsertPrompt = async (supabase: ReturnType<typeof createAdminClient>) => {
  const { data: existing } = await supabase
    .from('ai_prompts')
    .select('id, template')
    .eq('name', STRATEGY_CONFIG.prompt.name)
    .eq('version', STRATEGY_CONFIG.prompt.version)
    .maybeSingle();

  if (existing) {
    if (existing.template !== STOCK_RATING_PROMPT_TEMPLATE) {
      throw new Error(
        'Prompt template text changed without a version bump. ' +
          'Bump APP_VERSION in src/lib/strategyConfig.ts to create a new prompt version.'
      );
    }
    return { id: existing.id };
  }

  const { data, error } = await supabase
    .from('ai_prompts')
    .insert({
      name: STRATEGY_CONFIG.prompt.name,
      version: STRATEGY_CONFIG.prompt.version,
      template: STOCK_RATING_PROMPT_TEMPLATE,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const upsertModel = async (supabase: ReturnType<typeof createAdminClient>) => {
  const { data, error } = await supabase
    .from('ai_models')
    .upsert(
      {
        provider: STRATEGY_CONFIG.model.provider,
        name: STRATEGY_CONFIG.model.name,
        version: STRATEGY_CONFIG.model.version,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider,name,version' }
    )
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const getOrCreateStrategy = async (
  supabase: ReturnType<typeof createAdminClient>,
  promptId: string,
  modelId: string
) => {
  const { data: existing, error: fetchError } = await supabase
    .from('strategy_models')
    .select(
      'id, slug, name, version, description, ait_code, robot_name, index_name, rebalance_frequency, rebalance_day_of_week, portfolio_size, weighting_method, transaction_cost_bps, prompt_id, model_id, status'
    )
    .eq('slug', STRATEGY_CONFIG.slug)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    const costBps = toNumber(existing.transaction_cost_bps, STRATEGY_CONFIG.transactionCostBps);

    // Structural params must NEVER change for an existing slug.
    // Changing these requires a new AIT entry with a new slug.
    const structuralMismatch =
      existing.index_name !== STRATEGY_CONFIG.indexName ||
      existing.rebalance_frequency !== STRATEGY_CONFIG.rebalanceFrequency ||
      Number(existing.rebalance_day_of_week) !== STRATEGY_CONFIG.rebalanceDayOfWeek ||
      Number(existing.portfolio_size) !== STRATEGY_CONFIG.portfolioSize ||
      existing.weighting_method !== STRATEGY_CONFIG.weightingMethod ||
      Math.abs(costBps - STRATEGY_CONFIG.transactionCostBps) > 1e-9;

    if (structuralMismatch) {
      throw new Error(
        'Strategy structural parameters (index, frequency, portfolio_size, weighting, cost) changed for existing slug. Create a new AIT entry with a new slug instead of mutating the existing one.'
      );
    }

    // Non-structural updates (version, prompt, model, name, description, AIT identity) are
    // allowed in-place. Historical batch rows preserve their own prompt_id / model_id.
    const needsUpdate =
      existing.version !== STRATEGY_CONFIG.version ||
      existing.prompt_id !== promptId ||
      existing.model_id !== modelId ||
      existing.name !== STRATEGY_CONFIG.name ||
      existing.description !== STRATEGY_CONFIG.description ||
      existing.ait_code !== STRATEGY_CONFIG.aitCode ||
      existing.robot_name !== STRATEGY_CONFIG.robotName;

    if (needsUpdate) {
      await supabase
        .from('strategy_models')
        .update({
          name: STRATEGY_CONFIG.name,
          version: STRATEGY_CONFIG.version,
          ait_code: STRATEGY_CONFIG.aitCode,
          robot_name: STRATEGY_CONFIG.robotName,
          prompt_id: promptId,
          model_id: modelId,
          description: STRATEGY_CONFIG.description,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }

    return {
      ...existing,
      transaction_cost_bps: costBps,
    } as StrategyRow & { transaction_cost_bps: number };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('strategy_models')
    .insert({
      slug: STRATEGY_CONFIG.slug,
      name: STRATEGY_CONFIG.name,
      version: STRATEGY_CONFIG.version,
      ait_code: STRATEGY_CONFIG.aitCode,
      robot_name: STRATEGY_CONFIG.robotName,
      index_name: STRATEGY_CONFIG.indexName,
      rebalance_frequency: STRATEGY_CONFIG.rebalanceFrequency,
      rebalance_day_of_week: STRATEGY_CONFIG.rebalanceDayOfWeek,
      portfolio_size: STRATEGY_CONFIG.portfolioSize,
      weighting_method: STRATEGY_CONFIG.weightingMethod,
      transaction_cost_bps: STRATEGY_CONFIG.transactionCostBps,
      description: STRATEGY_CONFIG.description,
      status: 'active',
      prompt_id: promptId,
      model_id: modelId,
      is_default: true,
      updated_at: new Date().toISOString(),
    })
    .select(
      'id, slug, name, version, description, ait_code, robot_name, index_name, rebalance_frequency, rebalance_day_of_week, portfolio_size, weighting_method, transaction_cost_bps, prompt_id, model_id, status'
    )
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    ...inserted,
    transaction_cost_bps: toNumber(
      inserted.transaction_cost_bps,
      STRATEGY_CONFIG.transactionCostBps
    ),
  } as StrategyRow & { transaction_cost_bps: number };
};

const createSnapshot = async (
  supabase: ReturnType<typeof createAdminClient>,
  runDate: string,
  symbols: string[]
) => {
  const membershipHash = createHash('sha256').update(symbols.join(',')).digest('hex');

  const { data: existing, error: fetchError } = await supabase
    .from('nasdaq100_snapshots')
    .select('id')
    .eq('membership_hash', membershipHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing?.id) {
    return { id: existing.id, membershipHash, isNew: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('nasdaq100_snapshots')
    .insert({ effective_date: runDate, membership_hash: membershipHash })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { id: inserted.id, membershipHash, isNew: true };
};

const buildTopHoldings = (
  rows: Array<{ stock_id: string; symbol: string; score: number; latent_rank: number }>,
  portfolioSize: number
) => {
  const sorted = [...rows].sort((a, b) => {
    if (b.latent_rank !== a.latent_rank) {
      return b.latent_rank - a.latent_rank;
    }
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  const top = sorted.slice(0, portfolioSize);
  const weight = portfolioSize > 0 ? 1 / portfolioSize : 0;
  return top.map((row, index) => ({
    stock_id: row.stock_id,
    symbol: row.symbol,
    rank_position: index + 1,
    target_weight: weight,
    score: row.score,
    latent_rank: row.latent_rank,
  }));
};

const buildWeightMap = (holdings: HoldingRow[]) =>
  new Map(holdings.map((holding) => [holding.stock_id, holding.target_weight]));

const calculateTurnover = (oldMap: Map<string, number>, newMap: Map<string, number>) => {
  const ids = new Set([...oldMap.keys(), ...newMap.keys()]);
  let sumAbs = 0;
  ids.forEach((stockId) => {
    const oldWeight = oldMap.get(stockId) ?? 0;
    const newWeight = newMap.get(stockId) ?? 0;
    sumAbs += Math.abs(newWeight - oldWeight);
  });
  return sumAbs / 2;
};

const fetchPriceMapForRunDate = async (
  supabase: ReturnType<typeof createAdminClient>,
  runDate: string
) => {
  const { data, error } = await supabase
    .from('nasdaq_100_daily_raw')
    .select('symbol, last_sale_price')
    .eq('run_date', runDate);

  if (error) {
    throw new Error(error.message);
  }

  const map = new Map<string, number>();
  (data || []).forEach((row: { symbol: string; last_sale_price: string | null }) => {
    const price = parsePrice(row.last_sale_price);
    if (price !== null) {
      map.set(row.symbol, price);
    }
  });
  return map;
};

const buildCurrentPriceMap = (rows: NasdaqRow[]) => {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const price = parsePrice(row.lastSalePrice);
    if (price !== null) {
      map.set(row.symbol, price);
    }
  });
  return map;
};

const computeHoldingsReturn = (
  holdings: HoldingRow[],
  previousPrices: Map<string, number>,
  currentPrices: Map<string, number>
) => {
  let grossReturn = 0;
  holdings.forEach((holding) => {
    const fromPrice = previousPrices.get(holding.symbol) ?? null;
    const toPrice = currentPrices.get(holding.symbol) ?? null;
    const stockReturn = computeSimpleReturn(fromPrice, toPrice);
    grossReturn += holding.target_weight * stockReturn;
  });
  return grossReturn;
};

const loadBatchScores = async (supabase: ReturnType<typeof createAdminClient>, batchId: string) => {
  const { data, error } = await supabase
    .from('ai_analysis_runs')
    .select('stock_id, score, latent_rank, stocks(symbol)')
    .eq('batch_id', batchId);

  if (error) {
    throw new Error(error.message);
  }

  const rows: BatchScoreRow[] = [];
  (data || []).forEach(
    (row: {
      stock_id: string;
      score: number;
      latent_rank: number | null;
      stocks: { symbol: string } | { symbol: string }[] | null;
    }) => {
      const stock = firstRelation(row.stocks);
      const latent = toNullableNumber(row.latent_rank);
      if (!stock?.symbol || latent === null) {
        return;
      }
      rows.push({
        stock_id: row.stock_id,
        symbol: stock.symbol,
        score: toNumber(row.score, 0),
        latent_rank: clampLatentRank(latent),
      });
    }
  );

  return rows;
};

const buildForwardSamples = (
  batchScores: BatchScoreRow[],
  fromPrices: Map<string, number>,
  toPrices: Map<string, number>
) => {
  return batchScores
    .map((row) => {
      const fromPrice = fromPrices.get(row.symbol) ?? null;
      const toPrice = toPrices.get(row.symbol) ?? null;
      if (fromPrice === null || toPrice === null || fromPrice <= 0) {
        return null;
      }
      return {
        stock_id: row.stock_id,
        symbol: row.symbol,
        score: row.score,
        latent_rank: row.latent_rank,
        forward_return: computeSimpleReturn(fromPrice, toPrice),
      };
    })
    .filter((row): row is ForwardSample => Boolean(row));
};

const computeQuintileReturns = (samples: ForwardSample[]) => {
  if (samples.length < 5) {
    return [];
  }

  const ranked = [...samples].sort((a, b) => {
    if (a.latent_rank !== b.latent_rank) {
      return a.latent_rank - b.latent_rank;
    }
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.symbol.localeCompare(b.symbol);
  });

  const baseSize = Math.floor(ranked.length / 5);
  const remainder = ranked.length % 5;
  const rows: Array<{
    quintile: number;
    stock_count: number;
    return_value: number;
  }> = [];

  let cursor = 0;
  for (let quintile = 1; quintile <= 5; quintile++) {
    const size = baseSize + (quintile <= remainder ? 1 : 0);
    const bucket = ranked.slice(cursor, cursor + size);
    cursor += size;
    if (!bucket.length) {
      continue;
    }

    const avgReturn = bucket.reduce((sum, item) => sum + item.forward_return, 0) / bucket.length;
    rows.push({
      quintile,
      stock_count: bucket.length,
      return_value: avgReturn,
    });
  }

  return rows;
};

const computeCrossSectionalRegression = (samples: ForwardSample[]) => {
  const usable = samples.filter(
    (sample) => Number.isFinite(sample.score) && Number.isFinite(sample.forward_return)
  );
  if (usable.length < 5) {
    return null;
  }

  const n = usable.length;
  const meanX = usable.reduce((sum, row) => sum + row.score, 0) / n;
  const meanY = usable.reduce((sum, row) => sum + row.forward_return, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  let sst = 0;

  usable.forEach((row) => {
    const xDelta = row.score - meanX;
    const yDelta = row.forward_return - meanY;
    covariance += xDelta * yDelta;
    varianceX += xDelta * xDelta;
    sst += yDelta * yDelta;
  });

  if (varianceX <= 0) {
    return null;
  }

  const beta = covariance / varianceX;
  const alpha = meanY - beta * meanX;

  let sse = 0;
  usable.forEach((row) => {
    const predicted = alpha + beta * row.score;
    const residual = row.forward_return - predicted;
    sse += residual * residual;
  });

  const rSquared = sst <= 0 ? 0 : 1 - sse / sst;
  return { sampleSize: n, alpha, beta, rSquared };
};

const storeQuintileReturns = async (
  supabase: ReturnType<typeof createAdminClient>,
  strategyId: string,
  runDate: string,
  horizonWeeks: 1 | 4,
  rows: Array<{ quintile: number; stock_count: number; return_value: number }>
) => {
  if (!rows.length) {
    const { error: deleteError } = await supabase
      .from('strategy_quintile_returns')
      .delete()
      .eq('strategy_id', strategyId)
      .eq('run_date', runDate)
      .eq('horizon_weeks', horizonWeeks);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
    return;
  }

  const payload = rows.map((row) => ({
    strategy_id: strategyId,
    run_date: runDate,
    horizon_weeks: horizonWeeks,
    quintile: row.quintile,
    stock_count: row.stock_count,
    return_value: row.return_value,
  }));

  const { error: upsertError } = await supabase.from('strategy_quintile_returns').upsert(payload, {
    onConflict: 'strategy_id,run_date,horizon_weeks,quintile',
  });
  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const quintilesCsv = `(${rows.map((row) => row.quintile).join(',')})`;
  const { error: cleanupError } = await supabase
    .from('strategy_quintile_returns')
    .delete()
    .eq('strategy_id', strategyId)
    .eq('run_date', runDate)
    .eq('horizon_weeks', horizonWeeks)
    .not('quintile', 'in', quintilesCsv);
  if (cleanupError) {
    throw new Error(cleanupError.message);
  }
};

const storeRegression = async (
  supabase: ReturnType<typeof createAdminClient>,
  strategyId: string,
  runDate: string,
  horizonWeeks: 1 | 4,
  regression: { sampleSize: number; alpha: number; beta: number; rSquared: number }
) => {
  const { error } = await supabase.from('strategy_cross_sectional_regressions').upsert(
    {
      strategy_id: strategyId,
      run_date: runDate,
      horizon_weeks: horizonWeeks,
      sample_size: regression.sampleSize,
      alpha: regression.alpha,
      beta: regression.beta,
      r_squared: regression.rSquared,
    },
    { onConflict: 'strategy_id,run_date,horizon_weeks' }
  );

  if (error) {
    throw new Error(error.message);
  }
};

const handleRequest = async (req: Request) => {
  const t0 = Date.now();
  const runDate = getRunDate();

  const log = (step: string, detail?: unknown) => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const msg = detail !== undefined ? `${detail}` : '';
    console.log(`[cron +${elapsed}s] ${step}${msg ? ` — ${msg}` : ''}`);
  };

  const errors: CronErrorEntry[] = [];
  const errorKeys = new Set<string>();
  const runStartedAt = new Date().toISOString();

  /** When set, `finally` sends HTML digest (daily or rating-day) instead of errors-only email. */
  let cronDigestEmailEnabled = false;
  let cronDigestFatalMessage: string | null = null;
  const digestMarks = {
    prepEndMs: null as number | null,
    aiEndMs: null as number | null,
    perfEndMs: null as number | null,
    doneMs: null as number | null,
  };
  const digestMeta: CronRatingDigestMeta = {};

  const recordCronError = (subject: string, error: unknown, context?: string) => {
    const message = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
    const key = `${subject}::${context || ''}::${message}`;
    if (errorKeys.has(key)) {
      return;
    }
    errorKeys.add(key);
    errors.push({
      subject,
      context,
      message,
      at: new Date().toISOString(),
    });
  };

  const sendCronErrorEmail = async () => {
    if (!errors.length) {
      return;
    }
    if (!CRON_ERROR_EMAIL) {
      log('CRON ERRORS', `${errors.length} captured (email disabled)`);
      return;
    }

    const errorItems = errors
      .map((entry) => {
        const context = entry.context
          ? `<div><strong>Context:</strong> ${escapeHtml(entry.context)}</div>`
          : '';
        return `
          <li style="margin-bottom: 12px;">
            <div><strong>Subject:</strong> ${escapeHtml(entry.subject)}</div>
            ${context}
            <div><strong>Time:</strong> ${escapeHtml(entry.at)}</div>
            <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(entry.message)}</pre>
          </li>
        `;
      })
      .join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #b91c1c;">AITrader Cron Job Errors</h2>
        <p><strong>Run date:</strong> ${escapeHtml(runDate)}</p>
        <p><strong>Run started:</strong> ${escapeHtml(runStartedAt)}</p>
        <p><strong>Total unique errors:</strong> ${errors.length}</p>
        <ul style="padding-left: 18px;">${errorItems}</ul>
      </div>
    `;

    const subject = `AITrader Cron Errors (${runDate})`;
    const sent = await sendEmailWithRetry(CRON_ERROR_EMAIL, htmlBody, subject);
    if (!sent) {
      log('CRON EMAIL FAILED', 'Summary email could not be sent after retries');
    }
  };

  const formatMeta = (value: string | number | boolean | undefined | null) => {
    if (value === undefined || value === null) {
      return 'unavailable';
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return 'unavailable';
    }
    if (typeof value === 'number') {
      if (Math.abs(value) < 1 && value !== 0) {
        return `${(value * 100).toFixed(2)}%`;
      }
      return Number.isInteger(value) ? String(value) : String(value);
    }
    return String(value);
  };

  const formatPct = (value: number | undefined) => {
    if (value === undefined || !Number.isFinite(value)) {
      return 'unavailable';
    }
    return `${(value * 100).toFixed(2)}%`;
  };

  const sendCronRatingDigestEmail = async () => {
    if (!CRON_ERROR_EMAIL) {
      log('CRON RATING DIGEST', 'skipped (CRON_ERROR_EMAIL unset)');
      return;
    }

    let htmlBody: string;
    let subject: string;

    try {
      const endMs = digestMarks.doneMs ?? Date.now();
      const totalSec = ((endMs - t0) / 1000).toFixed(1);
      const hadFatal = Boolean(cronDigestFatalMessage);
      const hadRecordedErrors = errors.length > 0;
      const statusLabel = hadFatal ? 'Failed' : hadRecordedErrors ? 'Completed with warnings' : 'Completed';

      const isPricesOnly = digestMeta.runMode === 'prices_only';
      const benchmarkDailyPricesSummary =
        digestMeta.benchmarkDailyPricesIngest?.length
          ? digestMeta.benchmarkDailyPricesIngest.map((r) =>
              `${r.symbol}: ${
                r.ok
                  ? `${r.source} · ${r.upserted} rows · latest ${r.latestDate ?? '—'}${
                      r.fellBackToYahoo ? ' (Yahoo fallback)' : ''
                    }`
                  : `failed (${r.error ?? '?'})`
              }`
            ).join(' | ')
          : 'not run';
      const sectionRows = isPricesOnly
        ? [
            [
              'Price sync (NASDAQ list, stocks, nasdaq_100_daily_raw, snapshot membership)',
              formatSectionSeconds(t0, digestMarks.doneMs),
            ],
          ]
        : [
            [
              'Preparation (NASDAQ list, stocks, snapshot, batch, members)',
              formatSectionSeconds(t0, digestMarks.prepEndMs),
            ],
            ['AI ratings (parallel)', formatSectionSeconds(digestMarks.prepEndMs, digestMarks.aiEndMs)],
            [
              'Model portfolio + weekly performance row (DB)',
              formatSectionSeconds(digestMarks.aiEndMs, digestMarks.perfEndMs),
            ],
            [
              'After performance: 48-config fan-out, rebalance log, research, revalidation',
              formatSectionSeconds(digestMarks.perfEndMs, digestMarks.doneMs),
            ],
          ];

      const sectionTable = sectionRows
        .map(
          ([label, dur]) =>
            `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;">${escapeHtml(label)}</td>` +
            `<td style="padding:6px 12px;border:1px solid #e2e8f0;">${escapeHtml(dur)}</td></tr>`
        )
        .join('');

      const errorBlock =
        errors.length > 0
          ? `<h3 style="margin-top:20px;">Recorded issues (${errors.length})</h3><ul style="padding-left:18px;">${errors
              .map((entry) => {
                const ctx = entry.context ? ` — ${escapeHtml(entry.context)}` : '';
                return `<li style="margin-bottom:8px;"><strong>${escapeHtml(entry.subject)}</strong>${ctx}<br/><span style="font-size:12px;color:#64748b;">${escapeHtml(entry.at)}</span><pre style="background:#f8fafc;padding:8px;border-radius:6px;font-size:12px;">${escapeHtml(entry.message)}</pre></li>`;
              })
              .join('')}</ul>`
          : '';

      const fatalBlock = cronDigestFatalMessage
        ? `<h3 style="color:#b91c1c;">Fatal / thrown error</h3><pre style="background:#fef2f2;padding:12px;border-radius:8px;">${escapeHtml(cronDigestFatalMessage)}</pre>`
        : '';

      const digestNote =
        !isPricesOnly &&
        digestMarks.prepEndMs === null &&
        digestMarks.aiEndMs === null
          ? '<p style="color:#64748b;">Section timings were not fully recorded (run may have ended before the rating pipeline completed).</p>'
          : '';

      const digestTitle = isPricesOnly
        ? 'AITrader — Daily cron digest (prices only)'
        : 'AITrader — Rating day cron digest';
      const symbolCount = digestMeta.nasdaqSymbolCount ?? null;
      const parsedPriceCount = digestMeta.nasdaqSymbolsWithParsedPrice ?? null;
      const nasdaqPriceCoverage =
        symbolCount !== null && parsedPriceCount !== null
          ? `${parsedPriceCount} / ${symbolCount} symbols with a parsed last-sale price`
          : 'unavailable';
      const hasNoPrices = symbolCount !== null && symbolCount > 0 && parsedPriceCount === 0;
      const hasLowCoverage =
        symbolCount !== null &&
        symbolCount >= 20 &&
        parsedPriceCount !== null &&
        parsedPriceCount < Math.ceil(symbolCount * 0.25);
      const showCoverageNote = hasNoPrices || hasLowCoverage;
      const coverageNote = showCoverageNote
        ? '<p style="font-size:13px;color:#64748b;">Price fields were missing for many symbols today. Rows were still saved, but same-day mark calculations may be limited.</p>'
        : '';
      const benchmarkWarningRecorded = errors.some((entry) => entry.subject.startsWith('Stooq '));
      const benchmarkDegraded =
        benchmarkWarningRecorded ||
        (digestMeta.benchmarkEqualProxyQuality?.startsWith('degraded') ?? false);
      const benchmarkNote = benchmarkDegraded
        ? '<li style="font-size:13px;color:#64748b;">Benchmark data looked incomplete for this run, so benchmark comparisons may be less reliable this week.</li>'
        : '';
      const stooqLinesBlock = (digestMeta.benchmarkStooqLines ?? [])
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join('');
      const dbWriteBlock = isPricesOnly
        ? `
        <h3>Database writes (this run)</h3>
        <ul>
          <li><strong>Strategy metadata:</strong> <code>ai_prompts</code>, <code>ai_models</code>, <code>strategy_models</code> upserted.</li>
          <li><strong>Universe ingest:</strong> <code>stocks</code> upserted ${escapeHtml(formatMeta(digestMeta.stocksRowsUpserted))}; <code>nasdaq_100_daily_raw</code> upserted ${escapeHtml(formatMeta(digestMeta.nasdaqRawRowsUpserted))}.</li>
          <li><strong>Benchmark daily closes:</strong> <code>benchmark_daily_prices</code> — ${escapeHtml(benchmarkDailyPricesSummary)}</li>
          <li><strong>Snapshot:</strong> <code>nasdaq100_snapshots</code> ${escapeHtml(
            digestMeta.snapshotIsNew === undefined
              ? 'status unavailable'
              : digestMeta.snapshotIsNew
                ? 'created'
                : 'reused'
          )}; <code>nasdaq100_snapshot_stocks</code> upserted ${escapeHtml(formatMeta(digestMeta.snapshotMembers))} member rows.</li>
        </ul>
      `
        : `
        <h3>Database writes (this run)</h3>
        <ul>
          <li><strong>Strategy metadata:</strong> <code>ai_prompts</code>, <code>ai_models</code>, <code>strategy_models</code> upserted.</li>
          <li><strong>Universe ingest:</strong> <code>stocks</code> upserted ${escapeHtml(formatMeta(digestMeta.stocksRowsUpserted))}; <code>nasdaq_100_daily_raw</code> upserted ${escapeHtml(formatMeta(digestMeta.nasdaqRawRowsUpserted))}.</li>
          <li><strong>Benchmark daily closes:</strong> <code>benchmark_daily_prices</code> — ${escapeHtml(benchmarkDailyPricesSummary)}</li>
          <li><strong>Snapshot + run id:</strong> <code>nasdaq100_snapshots</code> ${escapeHtml(
            digestMeta.snapshotIsNew === undefined
              ? 'status unavailable'
              : digestMeta.snapshotIsNew
                ? 'created'
                : 'reused'
          )}; <code>nasdaq100_snapshot_stocks</code> upserted ${escapeHtml(formatMeta(digestMeta.snapshotMembers))}; <code>ai_run_batches</code> upserted (batch ${escapeHtml(formatMeta(digestMeta.batchId))}).</li>
          <li><strong>AI outputs:</strong> <code>ai_analysis_runs</code> upserted ${escapeHtml(formatMeta(digestMeta.aiOk))}; <code>nasdaq100_recommendations_current</code> refreshed for current members.</li>
          <li><strong>Portfolio/performance:</strong> <code>strategy_portfolio_holdings</code> wrote ${escapeHtml(formatMeta(digestMeta.holdingsCount))} holdings; <code>strategy_performance_weekly</code> upserted 1 row; <code>strategy_rebalance_actions</code> wrote ${escapeHtml(formatMeta(digestMeta.rebalanceActionsCount))} actions.</li>
          <li><strong>Research + configs:</strong> <code>strategy_quintile_returns</code> / <code>strategy_cross_sectional_regressions</code> updated when eligible; <code>strategy_portfolio_config_performance</code> and <code>portfolio_config_compute_queue</code> updated via precompute (OK ${escapeHtml(formatMeta(digestMeta.portfolioConfigsComputed))}, failed ${escapeHtml(formatMeta(digestMeta.portfolioConfigsFailed))}).</li>
        </ul>
      `;

      const universeBlock = `
        <h3>Universe &amp; NASDAQ-100 raw quotes</h3>
        <ul>
          <li><strong>Run mode:</strong> ${escapeHtml(isPricesOnly ? 'Daily price sync (no AI rebalance)' : 'Rating / rebalance day')}</li>
          <li><strong>Index / universe:</strong> ${escapeHtml(formatMeta(digestMeta.indexName))}</li>
          <li><strong>Symbols (this run):</strong> ${escapeHtml(formatMeta(digestMeta.nasdaqSymbolCount))}</li>
          <li><strong>NASDAQ list source:</strong> ${escapeHtml(digestMeta.nasdaqSource ?? 'unavailable')}</li>
          <li><strong><code>nasdaq_100_daily_raw</code> rows upserted:</strong> ${escapeHtml(formatMeta(digestMeta.nasdaqRawRowsUpserted))}</li>
          <li><strong>Last-sale price coverage:</strong> ${escapeHtml(nasdaqPriceCoverage)}</li>
        </ul>
        ${coverageNote}
      `;

      const ratingDayBlock = !isPricesOnly
        ? `
        <h3>Strategy / model</h3>
        <ul>
          <li><strong>Name:</strong> ${escapeHtml(formatMeta(digestMeta.strategyName))}</li>
          <li><strong>Model release:</strong> ${escapeHtml(formatMeta(digestMeta.strategyVersion))}</li>
          <li><strong>OpenAI model:</strong> ${escapeHtml(formatMeta(digestMeta.modelName))}</li>
          <li><strong>Prompt release:</strong> ${escapeHtml(formatMeta(digestMeta.promptVersion))}</li>
        </ul>
        <h3>Run identifiers</h3>
        <ul>
          <li><strong>Batch id:</strong> ${escapeHtml(formatMeta(digestMeta.batchId))}</li>
          <li><strong>Snapshot:</strong> ${escapeHtml(
            digestMeta.snapshotIsNew === undefined
              ? 'unavailable'
              : digestMeta.snapshotIsNew
                ? 'new'
                : 'reused'
          )} · <strong>Members:</strong> ${escapeHtml(formatMeta(digestMeta.snapshotMembers))}</li>
          <li><strong>AI concurrency:</strong> ${escapeHtml(formatMeta(digestMeta.aiConcurrency))}</li>
        </ul>
        <h3>AI rating outcomes</h3>
        <ul>
          <li><strong>OK:</strong> ${escapeHtml(formatMeta(digestMeta.aiOk))}</li>
          <li><strong>Failed (rating or DB upsert):</strong> ${escapeHtml(formatMeta(digestMeta.aiFailed))}</li>
          <li><strong>Missing stock row:</strong> ${escapeHtml(formatMeta(digestMeta.aiMissing))}</li>
        </ul>
        <h3>Portfolio / performance (model layer)</h3>
        <ul>
          <li><strong>Weekly sequence #:</strong> ${escapeHtml(formatMeta(digestMeta.sequenceNumber))}</li>
          <li><strong>Turnover:</strong> ${escapeHtml(formatPct(digestMeta.turnover))}</li>
          <li><strong>Gross return (week):</strong> ${escapeHtml(formatPct(digestMeta.grossReturn))}</li>
          <li><strong>Net return (week, after costs):</strong> ${escapeHtml(formatPct(digestMeta.netReturn))}</li>
          <li><strong>Benchmark week (approx, Stooq daily):</strong> NDX cap ${escapeHtml(formatPct(digestMeta.benchmarkNasdaqCap))}, QQQEW / equal proxy ${escapeHtml(formatPct(digestMeta.benchmarkNasdaqEqual))}, S&amp;P 500 ${escapeHtml(formatPct(digestMeta.benchmarkSp500))}</li>
          <li><strong>Benchmark source details:</strong>
            <ul style="margin-top:6px;">${stooqLinesBlock || `<li>${escapeHtml(formatMeta(digestMeta.benchmarkStooqDetail))}</li>`}</ul>
          </li>
          <li><strong>Equal proxy data quality:</strong> ${escapeHtml(formatMeta(digestMeta.benchmarkEqualProxyQuality))}</li>
          <li><strong>Stooq warning criteria:</strong> ${escapeHtml(formatMeta(digestMeta.benchmarkStooqCriteria))}</li>
          ${benchmarkNote}
          <li><strong>Rebalance actions logged:</strong> ${escapeHtml(formatMeta(digestMeta.rebalanceActionsCount))}</li>
          <li><strong>Portfolio configs precompute:</strong> ran ${escapeHtml(formatMeta(digestMeta.portfolioConfigBatchTriggered))} · non-default OK ${escapeHtml(formatMeta(digestMeta.portfolioConfigsComputed))} · failed ${escapeHtml(formatMeta(digestMeta.portfolioConfigsFailed))}</li>
        </ul>
      `
        : `
        <h3>Skipped today</h3>
        <p>AI ratings, weekly model portfolio, benchmarks, and config precompute run only on the configured rebalance weekday (or with <code>?force=1</code>). Today’s job stored NASDAQ-100 list quotes and snapshot membership only.</p>
      `;

      htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 720px;">
        <h2 style="color: ${hadFatal ? '#b91c1c' : '#0f172a'};">${escapeHtml(digestTitle)}</h2>
        <p><strong>Status:</strong> ${escapeHtml(statusLabel)}</p>
        <p><strong>Run date (UTC):</strong> ${escapeHtml(runDate)}</p>
        <p><strong>Started:</strong> ${escapeHtml(runStartedAt)}</p>
        <p><strong>Total wall time:</strong> ${escapeHtml(`${totalSec}s`)}</p>
        <p><strong>Force run:</strong> ${escapeHtml(formatMeta(digestMeta.forceRun))}</p>
        <p><strong>Git commit (deploy):</strong> ${escapeHtml(GIT_COMMIT_SHA || 'unavailable')}</p>
        <hr style="margin: 16px 0;" />
        ${universeBlock}
        ${ratingDayBlock}
        ${dbWriteBlock}
        <h3>Time by section</h3>
        ${digestNote}
        <table style="border-collapse:collapse;width:100%;font-size:14px;">${sectionTable}</table>
        ${fatalBlock}
        ${errorBlock}
        <p style="margin-top:24px;font-size:12px;color:#64748b;">If any line reads &quot;unavailable&quot;, that statistic could not be collected for this run.</p>
      </div>
    `;

      subject = isPricesOnly
        ? `AITrader Cron — ${runDate} (daily prices · ${statusLabel})`
        : `AITrader Cron — ${runDate} (${statusLabel})`;
    } catch (buildError) {
      const buildMsg = buildError instanceof Error ? buildError.message : JSON.stringify(buildError);
      log('CRON RATING DIGEST BUILD FAILED', buildMsg);
      subject = `AITrader Cron — ${runDate} (digest incomplete)`;
      htmlBody = `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>AITrader — Cron digest (template error)</h2>
          <p>The digest template failed to render. Run started: ${escapeHtml(runStartedAt)}</p>
          <p><strong>Build error:</strong></p>
          <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${escapeHtml(buildMsg)}</pre>
          ${
            cronDigestFatalMessage
              ? `<p><strong>Fatal run error (if any):</strong></p><pre style="background:#fef2f2;padding:12px;border-radius:8px;">${escapeHtml(cronDigestFatalMessage)}</pre>`
              : ''
          }
        </div>
      `;
    }

    const sent = await sendEmailWithRetry(CRON_ERROR_EMAIL, htmlBody, subject);
    if (!sent) {
      log('CRON RATING DIGEST EMAIL FAILED', 'Could not send after retries');
    } else {
      log('CRON RATING DIGEST EMAIL SENT');
    }
  };

  let summarySent = false;
  const sendCronSummaryOnce = async () => {
    if (summarySent) {
      return;
    }
    summarySent = true;

    if (cronDigestEmailEnabled) {
      await sendCronRatingDigestEmail();
      return;
    }

    await sendCronErrorEmail();
  };

  let timeoutWarningTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutSeconds = Number.isFinite(CRON_TIMEOUT_SECONDS)
    ? Math.max(30, CRON_TIMEOUT_SECONDS)
    : 300;
  const warningBufferSeconds = Number.isFinite(CRON_TIMEOUT_WARNING_BUFFER_SECONDS)
    ? Math.max(10, CRON_TIMEOUT_WARNING_BUFFER_SECONDS)
    : 25;
  const warningDelayMs = Math.max(5_000, (timeoutSeconds - warningBufferSeconds) * 1000);

  if (CRON_ERROR_EMAIL && timeoutSeconds > warningBufferSeconds + 1) {
    timeoutWarningTimer = setTimeout(() => {
      void (async () => {
        const elapsedSeconds = ((Date.now() - t0) / 1000).toFixed(1);
        const subject = `AITrader Cron Timeout Warning (${runDate})`;
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #b45309;">AITrader Cron Nearing Timeout</h2>
            <p><strong>Run date:</strong> ${runDate}</p>
            <p><strong>Run started:</strong> ${runStartedAt}</p>
            <p><strong>Elapsed:</strong> ~${elapsedSeconds}s</p>
            <p><strong>Configured timeout:</strong> ${timeoutSeconds}s</p>
            <p>
              This is a pre-timeout warning. The job is likely close to being terminated by Vercel.
              If there is no later success log/email, treat this run as timed out.
            </p>
            <hr style="margin: 16px 0;" />
            <h3 style="margin-bottom: 8px;">How to check this cron run</h3>
            <ol style="padding-left: 18px; line-height: 1.5;">
              <li>Open Vercel Dashboard -> your project -> Logs.</li>
              <li>Filter logs by path <code>/api/cron/daily</code> and this run time.</li>
              <li>Look for timeout markers such as <code>Function timed out</code> or missing final <code>DONE</code> log.</li>
              <li>If needed, trigger a manual run and monitor:
                <code style="display:block; margin-top:6px;">GET /api/cron/daily?force=1</code>
              </li>
            </ol>
          </div>
        `;
        const sent = await sendEmailWithRetry(CRON_ERROR_EMAIL, htmlBody, subject);
        if (!sent) {
          log('CRON TIMEOUT WARNING EMAIL FAILED');
        } else {
          log('CRON TIMEOUT WARNING EMAIL SENT', `elapsed=${elapsedSeconds}s`);
        }
      })();
    }, warningDelayMs);
  }

  log('START', `pid=${process.pid}`);

  try {
    const auth = isAuthorized(req);
    if (!auth.ok) {
      log('AUTH FAILED', auth.reason);
      recordCronError('Cron authorization failed', auth.reason);
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }
    log('AUTH OK');

    const forceRunRaw = new URL(req.url).searchParams.get('force');
    const forceRun = forceRunRaw === '1' || forceRunRaw === 'true';
    const runWeekday = getUtcWeekday(runDate);
    const isRebalanceDay = forceRun || runWeekday === STRATEGY_CONFIG.rebalanceDayOfWeek;

    cronDigestEmailEnabled = Boolean(CRON_ERROR_EMAIL);
    digestMeta.forceRun = forceRun;
    digestMeta.runMode = isRebalanceDay ? 'rating_day' : 'prices_only';

    if (!isRebalanceDay) {
      log(
        'DAILY MODE',
        `Not rebalance day. run_weekday=${runWeekday}, rebalance_day=${STRATEGY_CONFIG.rebalanceDayOfWeek}. Will save prices only.`
      );
    }

    const supabase = createAdminClient();
    log('CONFIG', `runDate=${runDate}, forceRun=${forceRun}, isRebalanceDay=${isRebalanceDay}`);

    // ----- Step 1: Fetch NASDAQ-100 list (API -> DB fallback) -----
    let nasdaqRows: NasdaqRow[] = [];
    try {
      nasdaqRows = await fetchNasdaq100();
      digestMeta.nasdaqSource = 'api';
      digestMeta.nasdaqSymbolCount = nasdaqRows.length;
      log('NASDAQ FETCH OK', `${nasdaqRows.length} symbols from API`);
    } catch (error) {
      log('NASDAQ FETCH FAILED', error instanceof Error ? error.message : error);
      recordCronError('Nasdaq API fetch failed', error);
    }

    if (!nasdaqRows.length) {
      const { data: latestSnapshot, error: latestSnapshotError } = await supabase
        .from('nasdaq100_snapshots')
        .select('id')
        .order('effective_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestSnapshotError) {
        recordCronError('Fallback snapshot lookup failed', latestSnapshotError);
      }

      if (latestSnapshot?.id) {
        const { data: snapMembers, error: fallbackMembersError } = await supabase
          .from('nasdaq100_snapshot_stocks')
          .select('stocks(symbol, company_name)')
          .eq('snapshot_id', latestSnapshot.id);

        if (fallbackMembersError) {
          recordCronError('Fallback snapshot members fetch failed', fallbackMembersError);
        }

        type SnapMemberRow = {
          stocks:
            | { symbol: string; company_name: string | null }
            | { symbol: string; company_name: string | null }[]
            | null;
        };
        const rows = (snapMembers || []) as SnapMemberRow[];
        const dbRows = rows
          .map((member) => firstRelation(member.stocks))
          .filter((stock): stock is { symbol: string; company_name: string | null } =>
            Boolean(stock)
          )
          .map((stock) => ({
            symbol: stock.symbol,
            companyName: stock.company_name || stock.symbol,
          }));

        if (dbRows.length) {
          nasdaqRows = dbRows;
          digestMeta.nasdaqSource = 'fallback';
          digestMeta.nasdaqSymbolCount = nasdaqRows.length;
          log('NASDAQ FALLBACK DB', `${nasdaqRows.length} symbols from latest snapshot`);
        }
      }
    }

    if (!nasdaqRows.length) {
      recordCronError('No Nasdaq 100 symbols available', 'API failed and DB fallback empty');
      return NextResponse.json({ error: 'No Nasdaq 100 symbols available' }, { status: 500 });
    }

    // ----- Step 2: Upsert prompt/model + immutable strategy -----
    const promptRow = await upsertPrompt(supabase);
    const modelRow = await upsertModel(supabase);
    const strategy = await getOrCreateStrategy(supabase, promptRow.id, modelRow.id);
    const transactionCostBps = toNumber(
      strategy.transaction_cost_bps,
      STRATEGY_CONFIG.transactionCostBps
    );

    log(
      'STRATEGY',
      `${strategy.slug} (${strategy.version}), rebalance_day=${strategy.rebalance_day_of_week}`
    );

    digestMeta.strategySlug = strategy.slug;
    digestMeta.strategyName = strategy.name;
    digestMeta.strategyVersion = strategy.version;
    digestMeta.indexName = strategy.index_name;
    digestMeta.modelName = STRATEGY_CONFIG.model.name;
    digestMeta.promptVersion = STRATEGY_CONFIG.prompt.version;

    // ----- Step 3: Upsert stocks -----
    const stockPayload = nasdaqRows.map((row) => ({
      symbol: row.symbol,
      company_name: row.companyName || null,
      exchange: 'NASDAQ',
      updated_at: new Date().toISOString(),
    }));

    const { data: upsertedStocks, error: upsertError } = await supabase
      .from('stocks')
      .upsert(stockPayload, { onConflict: 'symbol' })
      .select('id, symbol, company_name');

    if (upsertError) {
      recordCronError('Supabase stock upsert failed', upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    log('STOCKS UPSERTED', `${(upsertedStocks || []).length} rows`);
    digestMeta.stocksRowsUpserted = (upsertedStocks || []).length;

    const stockMap = new Map(
      (upsertedStocks || []).map((stock: StockRow) => [stock.symbol, stock])
    );

    // ----- Step 4: Store raw snapshot rows -----
    const rawPayload = nasdaqRows.map((row) => ({
      run_date: runDate,
      symbol: row.symbol,
      company_name: row.companyName || null,
      market_cap: row.marketCap || null,
      last_sale_price: row.lastSalePrice || null,
      net_change: row.netChange || null,
      percentage_change: row.percentageChange || null,
      delta_indicator: row.deltaIndicator || null,
    }));

    const { error: rawError } = await supabase
      .from('nasdaq_100_daily_raw')
      .upsert(rawPayload, { onConflict: 'run_date,symbol' });

    if (rawError) {
      recordCronError('Failed to store Nasdaq raw data', rawError);
      return NextResponse.json({ error: rawError.message }, { status: 500 });
    }
    log('RAW UPSERTED', `${rawPayload.length} rows`);

    const nasdaqSymbolsWithParsedPrice = nasdaqRows.filter(
      (row) => parsePrice(row.lastSalePrice) !== null
    ).length;
    digestMeta.nasdaqRawRowsUpserted = rawPayload.length;
    digestMeta.nasdaqSymbolsWithParsedPrice = nasdaqSymbolsWithParsedPrice;

    if (nasdaqRows.length > 0 && nasdaqSymbolsWithParsedPrice === 0) {
      recordCronError(
        'Nasdaq API: no parsed last-sale prices',
        new Error(
          'Every symbol lacked a usable lastSalePrice (check Nasdaq list API payload or market closure).'
        ),
        `Listed symbols: ${nasdaqRows.length}, source: ${digestMeta.nasdaqSource ?? 'unknown'}`
      );
    } else if (
      nasdaqRows.length >= 20 &&
      nasdaqSymbolsWithParsedPrice < Math.ceil(nasdaqRows.length * 0.25)
    ) {
      recordCronError(
        'Nasdaq API: low last-sale price coverage',
        new Error(
          `${nasdaqSymbolsWithParsedPrice} of ${nasdaqRows.length} symbols had a parsed lastSalePrice.`
        )
      );
    }

    // ----- Step 4b: Persist benchmark daily closes (Stooq primary, Yahoo per-symbol fallback) -----
    const benchmarkIngestResults = await upsertBenchmarkDailyPricesFromStooq(supabase);
    digestMeta.benchmarkDailyPricesIngest = benchmarkIngestResults;
    for (const r of benchmarkIngestResults) {
      if (!r.ok) {
        recordCronError(
          'benchmark_daily_prices ingest failed',
          new Error(r.error ?? 'unknown'),
          `symbol=${r.symbol}`
        );
      }
    }
    log(
      'BENCHMARK DAILY PRICES',
      benchmarkIngestResults
        .map((r) => `${r.symbol}:${r.ok ? `${r.source}:${r.upserted}` : 'fail'}`)
        .join(' ')
    );

    // On non-rebalance days, we only save price data and snapshot membership
    if (!isRebalanceDay) {
      // Still update snapshot membership daily
      const symbols = Array.from(new Set(nasdaqRows.map((row) => row.symbol))).sort();
      const snapshot = await createSnapshot(supabase, runDate, symbols);
      const snapshotStocks = symbols
        .map((symbol) => stockMap.get(symbol))
        .filter((stock): stock is StockRow => Boolean(stock))
        .map((stock) => ({
          snapshot_id: snapshot.id,
          stock_id: stock.id,
        }));
      const { error: snapshotMembersError } = await supabase
        .from('nasdaq100_snapshot_stocks')
        .upsert(snapshotStocks, { onConflict: 'snapshot_id,stock_id' });
      if (snapshotMembersError) {
        recordCronError('Snapshot members upsert failed (daily)', snapshotMembersError);
      }
      digestMeta.snapshotIsNew = snapshot.isNew;
      digestMeta.snapshotMembers = snapshotStocks.length;
      log(
        'DAILY COMPLETE',
        `Prices saved for ${rawPayload.length} symbols. Snapshot updated. AI ratings skipped (not rebalance day).`
      );

      digestMarks.doneMs = Date.now();

      revalidatePath('/platform');
      revalidatePath('/platform/overview');

      const totalSeconds = ((Date.now() - t0) / 1000).toFixed(1);
      return NextResponse.json({
        ok: true,
        dailyOnly: true,
        runDate,
        pricesSaved: rawPayload.length,
        snapshotUpdated: true,
        aiRatings: false,
        benchmarkDailyPricesIngest: digestMeta.benchmarkDailyPricesIngest,
        elapsedSeconds: Number(totalSeconds),
      });
    }

    // ----- Step 5: Create/reuse weekly snapshot -----
    const symbols = Array.from(new Set(nasdaqRows.map((row) => row.symbol))).sort();
    const snapshot = await createSnapshot(supabase, runDate, symbols);

    const snapshotStocks = symbols
      .map((symbol) => stockMap.get(symbol))
      .filter((stock): stock is StockRow => Boolean(stock))
      .map((stock) => ({
        snapshot_id: snapshot.id,
        stock_id: stock.id,
      }));

    const { error: snapshotMembersError } = await supabase
      .from('nasdaq100_snapshot_stocks')
      .upsert(snapshotStocks, { onConflict: 'snapshot_id,stock_id' });

    if (snapshotMembersError) {
      recordCronError('Snapshot members upsert failed', snapshotMembersError);
      return NextResponse.json({ error: snapshotMembersError.message }, { status: 500 });
    }
    log(
      'SNAPSHOT READY',
      `${snapshot.isNew ? 'new' : 'reused'} id=${snapshot.id}, members=${snapshotStocks.length}`
    );

    digestMeta.snapshotIsNew = snapshot.isNew;
    digestMeta.snapshotMembers = snapshotStocks.length;

    // ----- Step 6: Create/reuse strategy batch -----
    const { data: batchRow, error: batchError } = await supabase
      .from('ai_run_batches')
      .upsert(
        {
          run_date: runDate,
          index_name: STRATEGY_CONFIG.indexName,
          strategy_id: strategy.id,
          snapshot_id: snapshot.id,
          prompt_id: promptRow.id,
          model_id: modelRow.id,
          run_frequency: 'weekly',
          git_commit_sha: GIT_COMMIT_SHA,
        },
        { onConflict: 'run_date,strategy_id' }
      )
      .select('id')
      .single();

    if (batchError) {
      recordCronError('Batch upsert failed', batchError);
      return NextResponse.json({ error: batchError.message }, { status: 500 });
    }
    log('BATCH UPSERTED', `id=${batchRow.id}`);

    digestMeta.batchId = batchRow.id;

    // ----- Step 7: Previous batch + previous score map -----
    const { data: previousBatch, error: previousBatchError } = await supabase
      .from('ai_run_batches')
      .select('id, run_date')
      .eq('strategy_id', strategy.id)
      .lt('run_date', runDate)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousBatchError) {
      recordCronError('Previous batch lookup failed', previousBatchError);
    }

    const previousRunsMap = new Map<string, { score: number; bucket: 'buy' | 'hold' | 'sell' }>();
    if (previousBatch?.id) {
      const { data: previousRuns, error: previousRunsError } = await supabase
        .from('ai_analysis_runs')
        .select('stock_id, score, bucket')
        .eq('batch_id', previousBatch.id);

      if (previousRunsError) {
        recordCronError('Previous runs fetch failed', previousRunsError);
      } else {
        (previousRuns || []).forEach((row: PreviousRun) => {
          previousRunsMap.set(row.stock_id, { score: row.score, bucket: row.bucket });
        });
      }
      log('PREVIOUS BATCH', `${previousBatch.run_date} with ${previousRunsMap.size} prior scores`);
    } else {
      log('PREVIOUS BATCH', 'None (initial live week)');
    }

    // ----- Step 8: Load snapshot members for AI scoring -----
    const { data: members, error: memberError } = await supabase
      .from('nasdaq100_snapshot_stocks')
      .select('stock_id, stocks(id, symbol, company_name)')
      .eq('snapshot_id', snapshot.id);

    if (memberError) {
      recordCronError('Snapshot members fetch failed', memberError);
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    const memberRows = ((members || []) as MemberRow[])
      .map((row) => ({
        stock_id: row.stock_id,
        stock: firstRelation(row.stocks),
      }))
      .filter((row): row is { stock_id: string; stock: StockRow } => Boolean(row.stock));

    if (!memberRows.length) {
      recordCronError('No members found for snapshot', snapshot.id);
      return NextResponse.json({ error: 'No members found for snapshot' }, { status: 500 });
    }
    log('MEMBERS LOADED', `${memberRows.length} stocks`);

    digestMarks.prepEndMs = Date.now();

    // ----- Step 9: Run AI analysis weekly across all constituents -----
    const concurrency = Number(process.env.AI_CONCURRENCY || 20);
    digestMeta.aiConcurrency = Number.isFinite(concurrency) ? concurrency : undefined;
    log('AI START', `concurrency=${concurrency}, stocks=${memberRows.length}`);

    let completed = 0;
    let failed = 0;

    const results = await chunkWithConcurrency(memberRows, concurrency, async (member) => {
      if (!member.stock) {
        completed++;
        return { status: 'missing_stock', stock_id: member.stock_id } satisfies AiProcessResult;
      }

      const previous = previousRunsMap.get(member.stock_id) || {
        score: null,
        bucket: null,
      };

      const prompt = buildStockRatingPrompt({
        ticker: member.stock.symbol,
        companyName: member.stock.company_name || member.stock.symbol,
        runDate,
        previousScore: previous.score ?? null,
        previousBucket: previous.bucket ?? null,
      });

      let parsed: StockRatingParsed;
      let citations: Citation[] = [];
      let sources: WebSource[] = [];
      let rawResponse: unknown = null;

      try {
        const aiStart = Date.now();
        const response = await requestStockRating(prompt);
        parsed = response.parsed;
        citations = response.citations;
        sources = response.sources;
        rawResponse = response.raw;
        const aiMs = Date.now() - aiStart;
        log(
          `AI OK [${++completed}/${memberRows.length}]`,
          `${member.stock.symbol}: score=${parsed.score}, latent_rank=${parsed.latent_rank}, ${aiMs}ms`
        );
      } catch (error) {
        failed++;
        completed++;
        recordCronError('OpenAI stock rating failed', error, `Ticker: ${member.stock.symbol}`);
        log(
          `AI FAILED [${completed}/${memberRows.length}]`,
          `${member.stock.symbol}: ${error instanceof Error ? error.message : 'unknown'}`
        );
        parsed = {
          ticker: member.stock.symbol,
          date: runDate,
          score: 0,
          latent_rank: 0.5,
          confidence: 0,
          reason_1s: 'Model evaluation unavailable due to an upstream error.',
          risks: ['Data unavailable', 'Model error'],
          change: {
            changed_bucket: false,
            previous_bucket: previous.bucket ?? null,
            current_bucket: 'hold',
            change_explanation: null,
          },
        };
        rawResponse = { error: error instanceof Error ? error.message : 'unknown error' };
      }

      const score = clampScore(Number(parsed.score));
      const latentRank = clampLatentRank(Number(parsed.latent_rank));
      const confidence = clampConfidence(Number(parsed.confidence));
      const scoreDelta =
        previous.score === null || previous.score === undefined ? null : score - previous.score;
      const bucket = bucketFromScore(score);
      const previousBucket = previous.bucket ?? null;
      const changedBucket = previousBucket ? previousBucket !== bucket : false;
      const bucketChangeExplanation = changedBucket
        ? (parsed.change?.change_explanation ?? null)
        : null;

      const { data: runRow, error: runError } = await supabase
        .from('ai_analysis_runs')
        .upsert(
          {
            batch_id: batchRow.id,
            stock_id: member.stock_id,
            score,
            latent_rank: latentRank,
            score_delta: scoreDelta,
            confidence,
            bucket,
            bucket_change_explanation: bucketChangeExplanation,
            prompt_text: prompt,
            reason_1s: parsed.reason_1s || null,
            risks: parsed.risks || [],
            citations,
            sources,
            raw_response: rawResponse,
          },
          { onConflict: 'batch_id,stock_id' }
        )
        .select('id')
        .single();

      if (runError) {
        failed++;
        recordCronError(
          'Supabase analysis upsert failed',
          runError,
          `Ticker: ${member.stock.symbol}`
        );
        return {
          status: 'failed',
          stock_id: member.stock_id,
          symbol: member.stock.symbol,
          company_name: member.stock.company_name,
          score,
          latent_rank: latentRank,
          confidence,
          bucket,
          error: runError.message,
        } satisfies AiProcessResult;
      }

      const { error: currentError } = await supabase
        .from('nasdaq100_recommendations_current')
        .upsert(
          {
            stock_id: member.stock_id,
            latest_run_id: runRow.id,
            score,
            latent_rank: latentRank,
            score_delta: scoreDelta,
            confidence,
            bucket,
            reason_1s: parsed.reason_1s || null,
            risks: parsed.risks || [],
            citations,
            sources,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'stock_id' }
        );

      if (currentError) {
        failed++;
        recordCronError(
          'Supabase current recommendations upsert failed',
          currentError,
          `Ticker: ${member.stock.symbol}`
        );
        return {
          status: 'failed',
          stock_id: member.stock_id,
          symbol: member.stock.symbol,
          company_name: member.stock.company_name,
          score,
          latent_rank: latentRank,
          confidence,
          bucket,
          error: currentError.message,
        } satisfies AiProcessResult;
      }

      revalidatePath(`/stocks/${member.stock.symbol.toLowerCase()}`);

      return {
        status: 'ok',
        stock_id: member.stock_id,
        symbol: member.stock.symbol,
        company_name: member.stock.company_name,
        score,
        latent_rank: latentRank,
        confidence,
        bucket,
      } satisfies AiProcessResult;
    });

    log('AI COMPLETE', `${completed} processed, ${failed} failed`);

    digestMarks.aiEndMs = Date.now();
    digestMeta.aiOk = results.filter((result) => result.status === 'ok').length;
    digestMeta.aiFailed = results.filter((result) => result.status === 'failed').length;
    digestMeta.aiMissing = results.filter((result) => result.status === 'missing_stock').length;

    // ----- Step 10: Remove stale recommendation rows -----
    const memberIds = memberRows.map((member) => member.stock_id);
    if (memberIds.length) {
      const memberIdsFilter = `(${memberIds.join(',')})`;
      const { error: cleanupError } = await supabase
        .from('nasdaq100_recommendations_current')
        .delete()
        .not('stock_id', 'in', memberIdsFilter);

      if (cleanupError) {
        recordCronError('Current recommendations cleanup failed', cleanupError);
        return NextResponse.json({ error: cleanupError.message }, { status: 500 });
      }
    }

    // ----- Step 11: Deterministic Top-20 equal-weight portfolio -----
    const scoredRows = results
      .map((row) => {
        if (row.status === 'missing_stock') {
          return null;
        }
        return {
          stock_id: row.stock_id,
          symbol: row.symbol,
          score: row.score,
          latent_rank: row.latent_rank,
        };
      })
      .filter(
        (
          row
        ): row is {
          stock_id: string;
          symbol: string;
          score: number;
          latent_rank: number;
        } => Boolean(row)
      );

    const topHoldings = buildTopHoldings(scoredRows, strategy.portfolio_size);
    if (topHoldings.length !== strategy.portfolio_size) {
      const message = `Expected ${strategy.portfolio_size} holdings, got ${topHoldings.length}`;
      recordCronError('Top-20 portfolio failed', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    digestMeta.holdingsCount = topHoldings.length;

    const { error: deleteHoldingsError } = await supabase
      .from('strategy_portfolio_holdings')
      .delete()
      .eq('strategy_id', strategy.id)
      .eq('run_date', runDate);

    if (deleteHoldingsError) {
      recordCronError('Delete existing strategy holdings failed', deleteHoldingsError);
      return NextResponse.json({ error: deleteHoldingsError.message }, { status: 500 });
    }

    const { error: insertHoldingsError } = await supabase
      .from('strategy_portfolio_holdings')
      .insert(
        topHoldings.map((holding) => ({
          strategy_id: strategy.id,
          run_date: runDate,
          batch_id: batchRow.id,
          stock_id: holding.stock_id,
          symbol: holding.symbol,
          rank_position: holding.rank_position,
          target_weight: holding.target_weight,
          score: holding.score,
          latent_rank: holding.latent_rank,
          membership_status: 'active',
        }))
      );

    if (insertHoldingsError) {
      recordCronError('Insert strategy holdings failed', insertHoldingsError);
      return NextResponse.json({ error: insertHoldingsError.message }, { status: 500 });
    }

    // ----- Step 12: Load previous holdings + prices -----
    const previousHoldings: HoldingRow[] = [];
    if (previousBatch?.run_date) {
      const { data: previousHoldingsRows, error: previousHoldingsError } = await supabase
        .from('strategy_portfolio_holdings')
        .select('stock_id, symbol, target_weight')
        .eq('strategy_id', strategy.id)
        .eq('run_date', previousBatch.run_date);

      if (previousHoldingsError) {
        recordCronError('Previous holdings fetch failed', previousHoldingsError);
      } else {
        (previousHoldingsRows || []).forEach((row: HoldingRow) => {
          previousHoldings.push({
            stock_id: row.stock_id,
            symbol: row.symbol,
            target_weight: toNumber(row.target_weight, 0),
          });
        });
      }
    }

    const currentPriceMap = buildCurrentPriceMap(nasdaqRows);
    const previousPriceMap = previousBatch?.run_date
      ? await fetchPriceMapForRunDate(supabase, previousBatch.run_date)
      : new Map<string, number>();

    // ----- Step 13: Weekly return + turnover + transaction cost -----
    const oldWeightMap = buildWeightMap(previousHoldings);
    const newWeightMap = new Map(
      topHoldings.map((holding) => [holding.stock_id, holding.target_weight] as const)
    );

    const grossReturn = previousHoldings.length
      ? computeHoldingsReturn(previousHoldings, previousPriceMap, currentPriceMap)
      : 0;
    const turnover = previousHoldings.length ? calculateTurnover(oldWeightMap, newWeightMap) : 1;
    const transactionCostRate = transactionCostBps / 10_000;
    const transactionCost = turnover * transactionCostRate;
    const netReturn = grossReturn - transactionCost;

    // ----- Step 14: Benchmark returns (Nasdaq cap/equal + S&P 500) -----
    let nasdaqCapWeightReturn = 0;
    let nasdaqEqualWeightReturn = 0;
    let sp500Return = 0;

    if (previousBatch?.run_date) {
      const fromDate = previousBatch.run_date;
      const [ndxDetail, qqewDetail, spxDetail] = await Promise.all([
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqCap, fromDate, runDate),
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual, fromDate, runDate),
        fetchBenchmarkReturnDetail(STOOQ_BENCHMARK_SYMBOLS.sp500, fromDate, runDate),
      ]);

      nasdaqCapWeightReturn = ndxDetail.returnValue;
      nasdaqEqualWeightReturn = qqewDetail.returnValue;
      sp500Return = spxDetail.returnValue;

      const benchmarkDetails: BenchmarkReturnDetail[] = [ndxDetail, qqewDetail, spxDetail];
      for (const d of benchmarkDetails) {
        const f = d.fetch;
        if (!f.ok) {
          recordCronError(
            'Stooq benchmark CSV fetch failed',
            f.error ?? 'unknown',
            `symbol=${f.symbol} http=${f.httpStatus ?? 'n/a'}`
          );
          continue;
        }
        if (f.rowCount > 0 && f.rowCount < 30) {
          recordCronError(
            'Stooq benchmark CSV thin history',
            JSON.stringify({ rowCount: f.rowCount, first: f.firstDate, last: f.lastDate }),
            `symbol=${f.symbol}`
          );
        }
        if (f.lastDate && shouldWarnForStaleBenchmarkBar(f.lastDate, runDate)) {
          const lag = getDateLagDetail(f.lastDate, runDate);
          recordCronError(
            'Stooq benchmark CSV may be stale (last bar before run date)',
            JSON.stringify({
              lastBar: f.lastDate,
              runDate,
              symbol: f.symbol,
              lagCalendarDays: lag?.calendarDays ?? null,
              lagWeekdayDays: lag?.weekdayDays ?? null,
              criteria: {
                maxCalendarDays: STOOQ_STALE_WARNING_MAX_CALENDAR_DAYS,
                maxWeekdayDays: STOOQ_STALE_WARNING_MAX_WEEKDAY_DAYS,
              },
            }),
            `symbol=${f.symbol}`
          );
        }
        if (d.fromBarDate && d.toBarDate && d.fromBarDate === d.toBarDate && fromDate < runDate) {
          recordCronError(
            'Stooq benchmark window used same OHLC bar for from/to',
            JSON.stringify({
              fromDate,
              toDate: runDate,
              barDate: d.fromBarDate,
              symbol: f.symbol,
              fromClose: d.fromClose,
              toClose: d.toClose,
            }),
            `symbol=${f.symbol}`
          );
        }
      }

      if (
        nasdaqCapWeightReturn === 0 &&
        nasdaqEqualWeightReturn === 0 &&
        sp500Return === 0
      ) {
        recordCronError(
          'Stooq all benchmark weekly returns are zero',
          JSON.stringify({
            fromDate,
            toDate: runDate,
            ndx: {
              ok: ndxDetail.fetch.ok,
              rows: ndxDetail.fetch.rowCount,
              last: ndxDetail.fetch.lastDate,
              bars: `${ndxDetail.fromBarDate ?? '—'}→${ndxDetail.toBarDate ?? '—'}`,
            },
            qqew: {
              ok: qqewDetail.fetch.ok,
              rows: qqewDetail.fetch.rowCount,
              last: qqewDetail.fetch.lastDate,
              bars: `${qqewDetail.fromBarDate ?? '—'}→${qqewDetail.toBarDate ?? '—'}`,
            },
            spx: {
              ok: spxDetail.fetch.ok,
              rows: spxDetail.fetch.rowCount,
              last: spxDetail.fetch.lastDate,
              bars: `${spxDetail.fromBarDate ?? '—'}→${spxDetail.toBarDate ?? '—'}`,
            },
          }),
          'weekly-benchmark-window'
        );
      }

      digestMeta.benchmarkStooqDetail = [
        `${STOOQ_BENCHMARK_SYMBOLS.nasdaqCap} n=${ndxDetail.fetch.rowCount} last=${ndxDetail.fetch.lastDate ?? '—'} bars ${ndxDetail.fromBarDate ?? '—'}→${ndxDetail.toBarDate ?? '—'}`,
        `${STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual} n=${qqewDetail.fetch.rowCount} last=${qqewDetail.fetch.lastDate ?? '—'} bars ${qqewDetail.fromBarDate ?? '—'}→${qqewDetail.toBarDate ?? '—'}`,
        `${STOOQ_BENCHMARK_SYMBOLS.sp500} n=${spxDetail.fetch.rowCount} last=${spxDetail.fetch.lastDate ?? '—'} bars ${spxDetail.fromBarDate ?? '—'}→${spxDetail.toBarDate ?? '—'}`,
      ].join(' · ');
      digestMeta.benchmarkStooqLines = [
        `NDX cap (${STOOQ_BENCHMARK_SYMBOLS.nasdaqCap}): latest ${ndxDetail.fetch.lastDate ?? '—'}, return window ${ndxDetail.fromBarDate ?? '—'} to ${ndxDetail.toBarDate ?? '—'}`,
        `Nasdaq equal proxy (${STOOQ_BENCHMARK_SYMBOLS.nasdaqEqual}): latest ${qqewDetail.fetch.lastDate ?? '—'}, return window ${qqewDetail.fromBarDate ?? '—'} to ${qqewDetail.toBarDate ?? '—'}`,
        `S&P 500 (${STOOQ_BENCHMARK_SYMBOLS.sp500}): latest ${spxDetail.fetch.lastDate ?? '—'}, return window ${spxDetail.fromBarDate ?? '—'} to ${spxDetail.toBarDate ?? '—'}`,
      ];
      const equalLag = qqewDetail.fetch.lastDate
        ? getDateLagDetail(qqewDetail.fetch.lastDate, runDate)
        : null;
      const equalProxyIssues = [
        !qqewDetail.fetch.ok ? 'fetch_failed' : null,
        qqewDetail.fetch.rowCount > 0 && qqewDetail.fetch.rowCount < 30 ? 'thin_history' : null,
        qqewDetail.fetch.lastDate &&
        shouldWarnForStaleBenchmarkBar(qqewDetail.fetch.lastDate, runDate)
          ? 'stale_beyond_threshold'
          : null,
        qqewDetail.fromBarDate &&
        qqewDetail.toBarDate &&
        qqewDetail.fromBarDate === qqewDetail.toBarDate &&
        fromDate < runDate
          ? 'same_bar_window'
          : null,
      ].filter((issue): issue is string => Boolean(issue));
      digestMeta.benchmarkEqualProxyQuality = equalProxyIssues.length
        ? `degraded (${equalProxyIssues.join(', ')}) · symbol=${qqewDetail.fetch.symbol} · last=${qqewDetail.fetch.lastDate ?? '—'} · lag=${equalLag ? `${equalLag.calendarDays}d/${equalLag.weekdayDays}wd` : 'n/a'}`
        : `ok · symbol=${qqewDetail.fetch.symbol} · last=${qqewDetail.fetch.lastDate ?? '—'} · lag=${equalLag ? `${equalLag.calendarDays}d/${equalLag.weekdayDays}wd` : 'n/a'}`;
      digestMeta.benchmarkStooqCriteria =
        `warn when lag exceeds ${STOOQ_STALE_WARNING_MAX_CALENDAR_DAYS} calendar days and ` +
        `${STOOQ_STALE_WARNING_MAX_WEEKDAY_DAYS} weekday day(s); monitor repeated degraded runs for source/symbol switch`;
    }

    // ----- Step 15: Upsert weekly strategy performance row -----
    const { data: previousPerformance, error: previousPerformanceError } = await supabase
      .from('strategy_performance_weekly')
      .select(
        'run_date, sequence_number, ending_equity, nasdaq100_cap_weight_equity, nasdaq100_equal_weight_equity, sp500_equity'
      )
      .eq('strategy_id', strategy.id)
      .lt('run_date', runDate)
      .order('run_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousPerformanceError) {
      recordCronError('Previous performance lookup failed', previousPerformanceError);
    }

    const previousPerf = (previousPerformance || null) as PerformanceRow | null;
    const sequenceNumber = previousPerf ? Number(previousPerf.sequence_number) + 1 : 1;
    const startingEquity = previousPerf
      ? toNumber(previousPerf.ending_equity, INITIAL_CAPITAL)
      : INITIAL_CAPITAL;
    const endingEquity = Math.max(0.01, startingEquity * (1 + netReturn));

    const capWeightStart = previousPerf
      ? toNumber(previousPerf.nasdaq100_cap_weight_equity, INITIAL_CAPITAL)
      : INITIAL_CAPITAL;
    const equalWeightStart = previousPerf
      ? toNumber(previousPerf.nasdaq100_equal_weight_equity, INITIAL_CAPITAL)
      : INITIAL_CAPITAL;
    const sp500Start = previousPerf
      ? toNumber(previousPerf.sp500_equity, INITIAL_CAPITAL)
      : INITIAL_CAPITAL;

    const capWeightEnd = Math.max(0.01, capWeightStart * (1 + nasdaqCapWeightReturn));
    const equalWeightEnd = Math.max(0.01, equalWeightStart * (1 + nasdaqEqualWeightReturn));
    const sp500End = Math.max(0.01, sp500Start * (1 + sp500Return));

    const { error: performanceUpsertError } = await supabase
      .from('strategy_performance_weekly')
      .upsert(
        {
          strategy_id: strategy.id,
          run_date: runDate,
          previous_run_date: previousBatch?.run_date ?? null,
          sequence_number: sequenceNumber,
          holdings_count: topHoldings.length,
          turnover,
          transaction_cost_bps: transactionCostBps,
          transaction_cost: transactionCost,
          gross_return: grossReturn,
          net_return: netReturn,
          starting_equity: startingEquity,
          ending_equity: endingEquity,
          nasdaq100_cap_weight_return: nasdaqCapWeightReturn,
          nasdaq100_equal_weight_return: nasdaqEqualWeightReturn,
          sp500_return: sp500Return,
          nasdaq100_cap_weight_equity: capWeightEnd,
          nasdaq100_equal_weight_equity: equalWeightEnd,
          sp500_equity: sp500End,
        },
        { onConflict: 'strategy_id,run_date' }
      );

    if (performanceUpsertError) {
      recordCronError('Strategy performance upsert failed', performanceUpsertError);
      return NextResponse.json({ error: performanceUpsertError.message }, { status: 500 });
    }

    digestMarks.perfEndMs = Date.now();
    digestMeta.sequenceNumber = sequenceNumber;
    digestMeta.turnover = turnover;
    digestMeta.grossReturn = grossReturn;
    digestMeta.netReturn = netReturn;
    digestMeta.benchmarkNasdaqCap = nasdaqCapWeightReturn;
    digestMeta.benchmarkNasdaqEqual = nasdaqEqualWeightReturn;
    digestMeta.benchmarkSp500 = sp500Return;

    // ----- Step 15b: Precompute all portfolio configs (inline — reliable on Vercel Hobby) -----
    try {
      const { computeAllPortfolioConfigs } = await import('@/lib/compute-all-portfolio-configs');
      const configResult = await computeAllPortfolioConfigs(supabase, strategy.id);
      digestMeta.portfolioConfigBatchTriggered = true;
      digestMeta.portfolioConfigsComputed = configResult.computedNonDefault;
      digestMeta.portfolioConfigsFailed = configResult.failedNonDefault;
      if (configResult.failedNonDefault > 0) {
        recordCronError(
          'Portfolio config compute had failures',
          new Error(
            `${configResult.failedNonDefault} config(s) failed; check portfolio_config_compute_queue`
          )
        );
      }
    } catch (batchTriggerError) {
      digestMeta.portfolioConfigBatchTriggered = false;
      digestMeta.portfolioConfigsComputed = undefined;
      digestMeta.portfolioConfigsFailed = undefined;
      recordCronError('Portfolio config inline compute failed', batchTriggerError);
    }

    // ----- Step 16: Persist deterministic rebalance actions -----
    const eligibleSymbols = new Set(memberRows.map((member) => member.stock.symbol));
    const oldMapByStockId = new Map(previousHoldings.map((holding) => [holding.stock_id, holding]));
    const newMapByStockId = new Map(
      topHoldings.map((holding) => [
        holding.stock_id,
        {
          stock_id: holding.stock_id,
          symbol: holding.symbol,
          target_weight: holding.target_weight,
        },
      ])
    );

    const actions: RebalanceActionRow[] = [];
    newMapByStockId.forEach((holding, stockId) => {
      if (!oldMapByStockId.has(stockId)) {
        actions.push({
          stock_id: stockId,
          symbol: holding.symbol,
          action_type: 'enter',
          action_label: 'Entered Top-20',
          previous_weight: null,
          new_weight: holding.target_weight,
        });
      }
    });

    oldMapByStockId.forEach((holding, stockId) => {
      if (newMapByStockId.has(stockId)) {
        return;
      }

      const exitedIndex = !eligibleSymbols.has(holding.symbol);
      actions.push({
        stock_id: stockId,
        symbol: holding.symbol,
        action_type: exitedIndex ? 'exit_index' : 'exit_rank',
        action_label: exitedIndex ? 'Exited Index - Sell at next rebalance' : 'Exited Top-20',
        previous_weight: holding.target_weight,
        new_weight: null,
      });
    });

    const { error: deleteActionsError } = await supabase
      .from('strategy_rebalance_actions')
      .delete()
      .eq('strategy_id', strategy.id)
      .eq('run_date', runDate);

    if (deleteActionsError) {
      recordCronError('Delete existing rebalance actions failed', deleteActionsError);
      return NextResponse.json({ error: deleteActionsError.message }, { status: 500 });
    }

    if (actions.length) {
      const { error: insertActionsError } = await supabase
        .from('strategy_rebalance_actions')
        .insert(
          actions.map((action) => ({
            strategy_id: strategy.id,
            run_date: runDate,
            stock_id: action.stock_id,
            symbol: action.symbol,
            action_type: action.action_type,
            action_label: action.action_label,
            previous_weight: action.previous_weight,
            new_weight: action.new_weight,
          }))
        );

      if (insertActionsError) {
        recordCronError('Insert rebalance actions failed', insertActionsError);
        return NextResponse.json({ error: insertActionsError.message }, { status: 500 });
      }
    }

    digestMeta.rebalanceActionsCount = actions.length;

    // ----- Step 17: Weekly research layer (quintiles + regression) -----
    if (previousBatch?.id && previousBatch.run_date) {
      const previousScores = await loadBatchScores(supabase, previousBatch.id);
      const oneWeekSamples = buildForwardSamples(previousScores, previousPriceMap, currentPriceMap);
      const oneWeekQuintiles = computeQuintileReturns(oneWeekSamples);

      try {
        await storeQuintileReturns(
          supabase,
          strategy.id,
          previousBatch.run_date,
          1,
          oneWeekQuintiles
        );
      } catch (error) {
        recordCronError('Store 1-week quintile returns failed', error);
      }

      const regression = computeCrossSectionalRegression(oneWeekSamples);
      if (regression) {
        try {
          await storeRegression(supabase, strategy.id, previousBatch.run_date, 1, regression);
        } catch (error) {
          recordCronError('Store cross-sectional regression failed', error);
        }
      }
    }

    // ----- Step 18: 4-week non-overlapping quintiles -----
    const formationSequence = sequenceNumber - 4;
    const shouldComputeFourWeek = formationSequence > 0 && (formationSequence - 1) % 4 === 0;

    if (shouldComputeFourWeek) {
      const { data: formationPerformance, error: formationPerformanceError } = await supabase
        .from('strategy_performance_weekly')
        .select('run_date')
        .eq('strategy_id', strategy.id)
        .eq('sequence_number', formationSequence)
        .maybeSingle();

      if (formationPerformanceError) {
        recordCronError('4-week formation performance lookup failed', formationPerformanceError);
      }

      const formationRunDate = formationPerformance?.run_date || null;
      if (formationRunDate) {
        const { data: formationBatch, error: formationBatchError } = await supabase
          .from('ai_run_batches')
          .select('id')
          .eq('strategy_id', strategy.id)
          .eq('run_date', formationRunDate)
          .maybeSingle();

        if (formationBatchError) {
          recordCronError('4-week formation batch lookup failed', formationBatchError);
        }

        if (formationBatch?.id) {
          try {
            const formationPriceMap = await fetchPriceMapForRunDate(supabase, formationRunDate);
            const formationScores = await loadBatchScores(supabase, formationBatch.id);
            const fourWeekSamples = buildForwardSamples(
              formationScores,
              formationPriceMap,
              currentPriceMap
            );
            const fourWeekQuintiles = computeQuintileReturns(fourWeekSamples);
            await storeQuintileReturns(
              supabase,
              strategy.id,
              formationRunDate,
              4,
              fourWeekQuintiles
            );
          } catch (error) {
            recordCronError('Store 4-week quintile returns failed', error);
          }
        }
      }
    }

    revalidatePath('/platform');
    revalidatePath('/platform/overview');
    revalidatePath('/platform/weekly');
    revalidatePath('/platform/performance');
    revalidatePath('/performance');
    revalidatePath('/performance', 'page');
    revalidatePath('/', 'page');
    revalidateTag(LANDING_TOP_PORTFOLIO_PERFORMANCE_CACHE_TAG);
    revalidateTag(RANKED_CONFIGS_CACHE_TAG);
    revalidateTag(`${RANKED_CONFIGS_CACHE_TAG}:${strategy.slug}`);
    revalidatePath('/strategy-models');
    // Revalidate per-slug performance and model detail pages
    revalidatePath('/performance/[slug]', 'page');
    revalidatePath('/strategy-models/[slug]', 'page');

    const summary = {
      ok: results.filter((result) => result.status === 'ok').length,
      failed: results.filter((result) => result.status === 'failed').length,
      missingStock: results.filter((result) => result.status === 'missing_stock').length,
    };
    digestMarks.doneMs = Date.now();
    const totalSeconds = ((Date.now() - t0) / 1000).toFixed(1);
    log(
      'DONE',
      `${summary.ok} ok, ${summary.failed} failed, ${summary.missingStock} missing, ${totalSeconds}s`
    );

    return NextResponse.json({
      runDate,
      strategy: {
        slug: strategy.slug,
        version: strategy.version,
        portfolioSize: strategy.portfolio_size,
        transactionCostBps,
      },
      total: results.length,
      ok: summary.ok,
      failed: summary.failed,
      missingStock: summary.missingStock,
      turnover,
      grossReturn,
      netReturn,
      benchmarkReturns: {
        nasdaq100CapWeight: nasdaqCapWeightReturn,
        nasdaq100EqualWeight: nasdaqEqualWeightReturn,
        sp500: sp500Return,
      },
      elapsedSeconds: Number(totalSeconds),
    });
  } catch (error) {
    cronDigestFatalMessage =
      error instanceof Error ? error.message : JSON.stringify(error, null, 2);
    recordCronError('Fatal cron failure', error);
    log('FATAL', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Cron run failed' },
      { status: 500 }
    );
  } finally {
    if (timeoutWarningTimer) {
      clearTimeout(timeoutWarningTimer);
    }
    await sendCronSummaryOnce();
  }
};

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
