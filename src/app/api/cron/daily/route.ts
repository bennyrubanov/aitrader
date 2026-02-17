import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  buildStockRatingPrompt,
  STOCK_RATING_PROMPT_TEMPLATE,
  StockRatingSchema,
  type StockRatingParsed,
} from '@/lib/aiPrompt';
import { STRATEGY_CONFIG, GIT_COMMIT_SHA } from '@/lib/strategyConfig';
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
const INITIAL_CAPITAL = 10_000;

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

type StrategyRow = {
  id: string;
  slug: string;
  name: string;
  version: string;
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

type StooqCsvRow = {
  date: string;
  close: number;
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

const computeSimpleReturn = (fromPrice: number | null, toPrice: number | null) => {
  if (
    fromPrice === null ||
    toPrice === null ||
    !Number.isFinite(fromPrice) ||
    !Number.isFinite(toPrice) ||
    fromPrice <= 0
  ) {
    return 0;
  }
  return (toPrice - fromPrice) / fromPrice;
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
    .from('trading_strategies')
    .select(
      'id, slug, name, version, index_name, rebalance_frequency, rebalance_day_of_week, portfolio_size, weighting_method, transaction_cost_bps, prompt_id, model_id, status'
    )
    .eq('slug', STRATEGY_CONFIG.slug)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing) {
    const costBps = toNumber(existing.transaction_cost_bps, STRATEGY_CONFIG.transactionCostBps);
    const mismatch =
      existing.name !== STRATEGY_CONFIG.name ||
      existing.version !== STRATEGY_CONFIG.version ||
      existing.index_name !== STRATEGY_CONFIG.indexName ||
      existing.rebalance_frequency !== STRATEGY_CONFIG.rebalanceFrequency ||
      Number(existing.rebalance_day_of_week) !== STRATEGY_CONFIG.rebalanceDayOfWeek ||
      Number(existing.portfolio_size) !== STRATEGY_CONFIG.portfolioSize ||
      existing.weighting_method !== STRATEGY_CONFIG.weightingMethod ||
      Math.abs(costBps - STRATEGY_CONFIG.transactionCostBps) > 1e-9 ||
      existing.prompt_id !== promptId ||
      existing.model_id !== modelId;

    if (mismatch) {
      throw new Error(
        'Strategy configuration mismatch detected for existing slug. Create a new strategy version/slug instead of mutating the existing one.'
      );
    }

    return {
      ...existing,
      transaction_cost_bps: costBps,
    } as StrategyRow & { transaction_cost_bps: number };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('trading_strategies')
    .insert({
      slug: STRATEGY_CONFIG.slug,
      name: STRATEGY_CONFIG.name,
      version: STRATEGY_CONFIG.version,
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
      'id, slug, name, version, index_name, rebalance_frequency, rebalance_day_of_week, portfolio_size, weighting_method, transaction_cost_bps, prompt_id, model_id, status'
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

const fetchStooqRows = async (symbol: string): Promise<StooqCsvRow[] | null> => {
  try {
    const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) {
      return null;
    }

    const rows = lines
      .slice(1)
      .map((line) => {
        const [date, _open, _high, _low, close] = line.split(',');
        const closeValue = Number(close);
        if (!date || !Number.isFinite(closeValue)) {
          return null;
        }
        return { date, close: closeValue };
      })
      .filter((row): row is StooqCsvRow => Boolean(row))
      .sort((a, b) => a.date.localeCompare(b.date));

    return rows.length ? rows : null;
  } catch {
    return null;
  }
};

const closeOnOrBefore = (rows: StooqCsvRow[], date: string) => {
  let latest: number | null = null;
  for (const row of rows) {
    if (row.date > date) {
      break;
    }
    latest = row.close;
  }
  return latest;
};

const fetchBenchmarkReturn = async (symbol: string, fromDate: string, toDate: string) => {
  const rows = await fetchStooqRows(symbol);
  if (!rows?.length) {
    return 0;
  }
  const fromClose = closeOnOrBefore(rows, fromDate);
  const toClose = closeOnOrBefore(rows, toDate);
  return computeSimpleReturn(fromClose, toClose);
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
  const { error: deleteError } = await supabase
    .from('strategy_quintile_returns')
    .delete()
    .eq('strategy_id', strategyId)
    .eq('run_date', runDate)
    .eq('horizon_weeks', horizonWeeks);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  if (!rows.length) {
    return;
  }

  const { error: insertError } = await supabase.from('strategy_quintile_returns').insert(
    rows.map((row) => ({
      strategy_id: strategyId,
      run_date: runDate,
      horizon_weeks: horizonWeeks,
      quintile: row.quintile,
      stock_count: row.stock_count,
      return_value: row.return_value,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
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

  const sendCronSummary = async () => {
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
          ? `<div><strong>Context:</strong> ${entry.context}</div>`
          : '';
        return `
          <li style="margin-bottom: 12px;">
            <div><strong>Subject:</strong> ${entry.subject}</div>
            ${context}
            <div><strong>Time:</strong> ${entry.at}</div>
            <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${entry.message}</pre>
          </li>
        `;
      })
      .join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #b91c1c;">AITrader Cron Job Errors</h2>
        <p><strong>Run date:</strong> ${runDate}</p>
        <p><strong>Run started:</strong> ${runStartedAt}</p>
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

  let summarySent = false;
  const sendCronSummaryOnce = async () => {
    if (summarySent) {
      return;
    }
    summarySent = true;
    await sendCronSummary();
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
      log(
        'DAILY COMPLETE',
        `Prices saved for ${rawPayload.length} symbols. Snapshot updated. AI ratings skipped (not rebalance day).`
      );

      revalidatePath('/platform/current');

      const totalSeconds = ((Date.now() - t0) / 1000).toFixed(1);
      return NextResponse.json({
        ok: true,
        dailyOnly: true,
        runDate,
        pricesSaved: rawPayload.length,
        snapshotUpdated: true,
        aiRatings: false,
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

    // ----- Step 9: Run AI analysis weekly across all constituents -----
    const concurrency = Number(process.env.AI_CONCURRENCY || 20);
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

    // ----- Step 11: Deterministic Top-20 equal-weight construction -----
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
      recordCronError('Top-20 construction failed', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }

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
      const [capRet, equalRet, spRet] = await Promise.all([
        fetchBenchmarkReturn('^ndx', previousBatch.run_date, runDate),
        fetchBenchmarkReturn('qqew.us', previousBatch.run_date, runDate),
        fetchBenchmarkReturn('^spx', previousBatch.run_date, runDate),
      ]);

      nasdaqCapWeightReturn = capRet;
      nasdaqEqualWeightReturn = equalRet;
      sp500Return = spRet;
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

    revalidatePath('/platform/current');
    revalidatePath('/platform/weekly');
    revalidatePath('/platform/performance');

    const summary = {
      ok: results.filter((result) => result.status === 'ok').length,
      failed: results.filter((result) => result.status === 'failed').length,
      missingStock: results.filter((result) => result.status === 'missing_stock').length,
    };
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
