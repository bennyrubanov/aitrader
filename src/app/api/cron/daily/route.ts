import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createHash } from "crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  buildStockRatingPrompt,
  PROMPT_NAME,
  PROMPT_VERSION,
  STOCK_RATING_PROMPT_TEMPLATE,
  StockRatingSchema,
  type StockRatingParsed,
} from "@/lib/aiPrompt";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmailByGmail } from "@/lib/sendEmailByGmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASDAQ_100_ENDPOINT = "https://api.nasdaq.com/api/quote/list-type/nasdaq100";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const CRON_ERROR_EMAIL = process.env.CRON_ERROR_EMAIL;

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
  stocks: StockRow | null;
};

type PreviousRun = {
  stock_id: string;
  score: number;
  bucket: "buy" | "hold" | "sell";
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

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const toOptionalString = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : undefined;

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

const getRunDate = () => new Date().toISOString().slice(0, 10);

const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
    return { ok: false, status: 500, reason: "CRON_SECRET is not configured." };
  }

  const headerToken =
    req.headers.get("x-cron-secret") ||
    req.headers.get("x-vercel-cron-secret") ||
    (req.headers.get("authorization") || "").replace("Bearer ", "");
  const queryToken = new URL(req.url).searchParams.get("secret");
  const token = headerToken || queryToken;

  if (token !== secret) {
    return { ok: false, status: 401, reason: "Unauthorized." };
  }

  return { ok: true };
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
      const parsedRow: NasdaqRow = { symbol: symbol || "" };
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
    .filter((row): row is NasdaqRow => !!row && !!row.symbol);
};

const fetchNasdaq100 = async (): Promise<NasdaqRow[]> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(NASDAQ_100_ENDPOINT, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "application/json",
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
    return "buy";
  }
  if (score <= -2) {
    return "sell";
  }
  return "hold";
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

const extractStructuredOutput = (payload: unknown) => {
  if (isRecord(payload)) {
    const status = payload.status;
    const incomplete = payload.incomplete_details;
    if (status === "incomplete" && isRecord(incomplete) && isString(incomplete.reason)) {
      throw new Error(`OpenAI response incomplete: ${incomplete.reason}`);
    }
  }

  if (isRecord(payload) && isString(payload.output_text)) {
    return { text: payload.output_text.trim(), refusal: null };
  }

  const output = isRecord(payload) ? payload.output : null;
  if (!Array.isArray(output)) {
    return { text: "", refusal: null };
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
      if (contentItem.type === "refusal" && isString(contentItem.refusal)) {
        return { text: "", refusal: contentItem.refusal };
      }
      if (contentItem.type === "output_text" && isString(contentItem.text)) {
        chunks.push(contentItem.text);
      }
    }
  }

  return { text: chunks.join("\n").trim(), refusal: null };
};

const parseStructuredOutput = <T>(outputText: string): T => {
  const trimmed = outputText.trim();
  if (!trimmed) {
    throw new Error("OpenAI response missing output_text");
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(sliced) as T;
      } catch (innerError) {
        const message = innerError instanceof Error ? innerError.message : "unknown parse error";
        throw new Error(`Failed to parse JSON output: ${message}`);
      }
    }
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Failed to parse JSON output: ${message}`);
  }
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

const extractSourcesAndCitations = (payload: unknown) => {
  const sources: WebSource[] = [];
  const citations: Citation[] = [];
  const output = isRecord(payload) ? payload.output : null;

  if (Array.isArray(output)) {
    output.forEach((item) => {
      if (isRecord(item) && item.type === "web_search_call" && isRecord(item.action)) {
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
            if (annotation.url) {
              citations.push({
                url: annotation.url,
                title,
              });
            }
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
    .filter((citation): citation is Citation => !!citation);

  return {
    sources: normalizedSources,
    citations: uniqueByUrl([...citations, ...citationFromSources]),
  };
};

const upsertPrompt = async (supabase: ReturnType<typeof createAdminClient>) => {
  const { data, error } = await supabase
    .from("ai_prompts")
    .upsert(
      {
        name: PROMPT_NAME,
        version: PROMPT_VERSION,
        template: STOCK_RATING_PROMPT_TEMPLATE,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "name,version" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const upsertModel = async (supabase: ReturnType<typeof createAdminClient>) => {
  const { data, error } = await supabase
    .from("ai_models")
    .upsert(
      {
        provider: "openai",
        name: DEFAULT_MODEL,
        version: "default",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,name,version" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const createSnapshot = async (
  supabase: ReturnType<typeof createAdminClient>,
  runDate: string,
  symbols: string[]
) => {
  const membershipHash = createHash("sha256")
    .update(symbols.join(","))
    .digest("hex");

  const { data: existing, error: fetchError } = await supabase
    .from("nasdaq100_snapshots")
    .select("id")
    .eq("membership_hash", membershipHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (existing?.id) {
    return { id: existing.id, membershipHash, isNew: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("nasdaq100_snapshots")
    .insert({ effective_date: runDate, membership_hash: membershipHash })
    .select("id")
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { id: inserted.id, membershipHash, isNew: true };
};

const requestStockRating = async (prompt: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const client = new OpenAI({ apiKey });
  const payload = await client.responses.parse({
    model: DEFAULT_MODEL,
    temperature: 0.2,
    max_output_tokens: 800,
    tools: [{ type: "web_search" }],
    tool_choice: { type: "web_search" },
    include: ["web_search_call.action.sources"],
    input: [
      {
        role: "system",
        content:
          "Use exactly one web_search call. Output only JSON matching the schema.",
      },
      { role: "user", content: prompt },
    ],
    text: {
      format: zodTextFormat(StockRatingSchema, "stock_rating"),
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

  const workers = Array.from({ length: concurrency }).map(async () => {
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

const handleRequest = async (req: Request) => {
  const t0 = Date.now();
  const log = (step: string, detail?: unknown) => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const msg = detail !== undefined ? `${detail}` : "";
    console.log(`[cron +${elapsed}s] ${step}${msg ? ` — ${msg}` : ""}`);
  };
  const errors: CronErrorEntry[] = [];
  const errorKeys = new Set<string>();
  const runStartedAt = new Date().toISOString();

  const recordCronError = (subject: string, error: unknown, context?: string) => {
    const message = error instanceof Error ? error.message : JSON.stringify(error, null, 2);
    const key = `${subject}::${context || ""}::${message}`;
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

  const sendCronSummary = async (runDate: string) => {
    if (!errors.length) {
      return;
    }
    if (!CRON_ERROR_EMAIL) {
      log("CRON ERRORS", `${errors.length} captured (email disabled)`);
      return;
    }

    const errorItems = errors
      .map((entry) => {
        const context = entry.context
          ? `<div><strong>Context:</strong> ${entry.context}</div>`
          : "";
        return `
          <li style="margin-bottom: 12px;">
            <div><strong>Subject:</strong> ${entry.subject}</div>
            ${context}
            <div><strong>Time:</strong> ${entry.at}</div>
            <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${entry.message}</pre>
          </li>
        `;
      })
      .join("");

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
      log("CRON EMAIL FAILED", "Summary email could not be sent after retries");
    }
  };
  let summarySent = false;
  const sendCronSummaryOnce = async (runDate: string) => {
    if (summarySent) {
      return;
    }
    summarySent = true;
    await sendCronSummary(runDate);
  };

  const runDate = getRunDate();
  log("START", `pid=${process.pid}`);

  try {
    const auth = isAuthorized(req);
    if (!auth.ok) {
      log("AUTH FAILED", auth.reason);
      recordCronError("Cron authorization failed", auth.reason);
      return NextResponse.json({ error: auth.reason }, { status: auth.status });
    }
    log("AUTH OK");

    const supabase = createAdminClient();
    const yesterdayDate = addDays(runDate, -1);
    log("CONFIG", `runDate=${runDate}, yesterday=${yesterdayDate}`);

  // ----- Step 1: Fetch NASDAQ-100 list (API -> DB fallback) -----
  let nasdaqRows: NasdaqRow[] = [];
  try {
    nasdaqRows = await fetchNasdaq100();
    log("NASDAQ FETCH OK", `${nasdaqRows.length} symbols from API`);
  } catch (error) {
    log("NASDAQ FETCH FAILED", error instanceof Error ? error.message : error);
    recordCronError("Nasdaq API fetch failed", error);
  }

  if (!nasdaqRows.length) {
    // Fallback: load NASDAQ-100 members from the most recent snapshot in Supabase
    const { data: latestSnapshot } = await supabase
      .from("nasdaq100_snapshots")
      .select("id")
      .order("effective_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestSnapshot?.id) {
      const { data: snapMembers } = await supabase
        .from("nasdaq100_snapshot_stocks")
        .select("stocks (symbol, company_name)")
        .eq("snapshot_id", latestSnapshot.id);

      type SnapMemberRow = { stocks: { symbol: string; company_name: string | null } | null };
      const rows = (snapMembers || []) as unknown as SnapMemberRow[];
      const dbRows = rows
        .map((m) => m.stocks)
        .filter(Boolean)
        .map((s) => ({
          symbol: s!.symbol,
          companyName: s!.company_name || s!.symbol,
        }));

      if (dbRows.length) {
        nasdaqRows = dbRows;
        log("NASDAQ FALLBACK DB", `${nasdaqRows.length} symbols from last snapshot in Supabase`);
      }
    }
  }

  if (!nasdaqRows.length) {
    log("ABORT", "No Nasdaq 100 symbols available (API failed, DB empty)");
    recordCronError("No Nasdaq 100 symbols available", "API failed and DB empty");
    return NextResponse.json(
      { error: "No Nasdaq 100 symbols available" },
      { status: 500 }
    );
  }

  // ----- Step 2: Upsert prompt + model -----
  const promptRow = await upsertPrompt(supabase);
  log("PROMPT UPSERTED", `id=${promptRow.id}, name=${PROMPT_NAME}, version=${PROMPT_VERSION}`);

  const modelRow = await upsertModel(supabase);
  log("MODEL UPSERTED", `id=${modelRow.id}, model=${DEFAULT_MODEL}`);

  // ----- Step 3: Upsert stocks into canonical table -----
  const stockPayload = nasdaqRows.map((row) => ({
    symbol: row.symbol,
    company_name: row.companyName || null,
    exchange: "NASDAQ",
    updated_at: new Date().toISOString(),
  }));

  const { data: upsertedStocks, error: upsertError } = await supabase
    .from("stocks")
    .upsert(stockPayload, { onConflict: "symbol" })
    .select("id, symbol, company_name");

  if (upsertError) {
    log("STOCKS UPSERT FAILED", upsertError.message);
    recordCronError("Supabase stock upsert failed", upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }
  log("STOCKS UPSERTED", `${(upsertedStocks || []).length} rows`);

  const stockMap = new Map(
    (upsertedStocks || []).map((stock: StockRow) => [stock.symbol, stock])
  );

  // ----- Step 4: Store raw NASDAQ API data -----
  const dailyRawPayload = nasdaqRows.map((row) => ({
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
    .from("nasdaq_100_daily_raw")
    .upsert(dailyRawPayload, { onConflict: "run_date,symbol" });

  if (rawError) {
    log("DAILY RAW UPSERT FAILED", rawError.message);
    recordCronError("Failed to store Nasdaq daily raw data", rawError);
    return NextResponse.json({ error: rawError.message }, { status: 500 });
  }
  log("DAILY RAW UPSERTED", `${dailyRawPayload.length} rows`);

  // ----- Step 5: Create or reuse NASDAQ-100 membership snapshot -----
  const symbols = Array.from(new Set(nasdaqRows.map((row) => row.symbol))).sort();
  const snapshot = await createSnapshot(supabase, runDate, symbols);
  log(
    "SNAPSHOT",
    snapshot.isNew
      ? `NEW snapshot created (id=${snapshot.id})`
      : `REUSED existing snapshot (id=${snapshot.id}, membership unchanged)`
  );

  if (snapshot.isNew) {
    const snapshotStocks = symbols
      .map((symbol) => stockMap.get(symbol))
      .filter(Boolean)
      .map((stock) => ({
        snapshot_id: snapshot.id,
        stock_id: stock?.id,
      }))
      .filter((stock): stock is { snapshot_id: string; stock_id: string } => !!stock.stock_id);

    const { error: snapshotError } = await supabase
      .from("nasdaq100_snapshot_stocks")
      .insert(snapshotStocks);

    if (snapshotError) {
      log("SNAPSHOT MEMBERS INSERT FAILED", snapshotError.message);
      recordCronError("Snapshot membership insert failed", snapshotError);
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }
    log("SNAPSHOT MEMBERS INSERTED", `${snapshotStocks.length} stocks linked`);
  }

  // ----- Step 6: Create or reuse batch for today -----
  const { data: batchRow, error: batchError } = await supabase
    .from("ai_run_batches")
    .upsert(
      {
        run_date: runDate,
        index_name: "nasdaq100",
        snapshot_id: snapshot.id,
        prompt_id: promptRow.id,
        model_id: modelRow.id,
      },
      { onConflict: "run_date,index_name,prompt_id,model_id" }
    )
    .select("id")
    .single();

  if (batchError) {
    log("BATCH UPSERT FAILED", batchError.message);
    recordCronError("Batch upsert failed", batchError);
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }
  log("BATCH UPSERTED", `id=${batchRow.id}`);

  // ----- Step 7: Fetch yesterday's runs for change detection -----
  const { data: yesterdayBatch } = await supabase
    .from("ai_run_batches")
    .select("id")
    .eq("run_date", yesterdayDate)
    .eq("index_name", "nasdaq100")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const previousRunsMap = new Map<string, { score: number; bucket: "buy" | "hold" | "sell" }>();

  if (yesterdayBatch?.id) {
    const { data: previousRuns } = await supabase
      .from("ai_analysis_runs")
      .select("stock_id, score, bucket")
      .eq("batch_id", yesterdayBatch.id);

    (previousRuns || []).forEach((row: PreviousRun) => {
      previousRunsMap.set(row.stock_id, { score: row.score, bucket: row.bucket });
    });
    log("PREVIOUS RUNS LOADED", `${previousRunsMap.size} scores from ${yesterdayDate}`);
  } else {
    log("PREVIOUS RUNS", `No batch found for ${yesterdayDate} (first run or gap day)`);
  }

  // ----- Step 8: Load snapshot members for AI processing -----
  const { data: members, error: memberError } = await supabase
    .from("nasdaq100_snapshot_stocks")
    .select("stock_id, stocks (id, symbol, company_name)")
    .eq("snapshot_id", snapshot.id);

  if (memberError) {
    log("SNAPSHOT MEMBERS FETCH FAILED", memberError.message);
    recordCronError("Snapshot members fetch failed", memberError);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  let memberRows = (members || []) as unknown as MemberRow[];
  if (!memberRows.length) {
    log("SNAPSHOT EMPTY", "No members found; attempting to backfill snapshot stocks");
    const snapshotStocks = symbols
      .map((symbol) => stockMap.get(symbol))
      .filter(Boolean)
      .map((stock) => ({
        snapshot_id: snapshot.id,
        stock_id: stock?.id,
      }));

    if (snapshotStocks.length) {
      const { error: backfillError } = await supabase
        .from("nasdaq100_snapshot_stocks")
        .insert(snapshotStocks);

      if (backfillError) {
        log("SNAPSHOT BACKFILL FAILED", backfillError.message);
      recordCronError("Snapshot backfill failed", backfillError);
        return NextResponse.json({ error: backfillError.message }, { status: 500 });
      }
      log("SNAPSHOT BACKFILLED", `${snapshotStocks.length} stocks linked`);
    }

    const { data: refreshedMembers, error: refreshError } = await supabase
      .from("nasdaq100_snapshot_stocks")
      .select("stock_id, stocks (id, symbol, company_name)")
      .eq("snapshot_id", snapshot.id);

    if (refreshError) {
      log("SNAPSHOT REFRESH FAILED", refreshError.message);
      recordCronError("Snapshot members refresh failed", refreshError);
      return NextResponse.json({ error: refreshError.message }, { status: 500 });
    }

    memberRows = (refreshedMembers || []) as unknown as MemberRow[];
    if (!memberRows.length) {
      log("ABORT", "No members found for snapshot after backfill");
      recordCronError("No members found for snapshot after backfill", snapshot.id);
      return NextResponse.json(
        { error: "No members found for snapshot after backfill" },
        { status: 500 }
      );
    }
  }
  log("MEMBERS LOADED", `${memberRows.length} stocks to analyze`);

  // ----- Step 9: Run AI analysis with concurrency -----
  const concurrency = Number(process.env.AI_CONCURRENCY || 20);
  log("AI ANALYSIS START", `concurrency=${concurrency}, stocks=${memberRows.length}`);

  let completed = 0;
  let failed = 0;

  const results = await chunkWithConcurrency(memberRows, concurrency, async (member) => {
    if (!member.stocks) {
      completed++;
      return { stock_id: member.stock_id, status: "missing_stock" };
    }

    const previous = previousRunsMap.get(member.stock_id) || {
      score: null,
      bucket: null,
    };

    let parsed: StockRatingParsed;
    let citations: Citation[] = [];
    let sources: WebSource[] = [];
    let rawResponse: unknown = null;

    const prompt = buildStockRatingPrompt({
      ticker: member.stocks.symbol,
      companyName: member.stocks.company_name || member.stocks.symbol,
      runDate,
      yesterdayScore: previous.score ?? null,
      yesterdayBucket: previous.bucket ?? null,
    });

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
        `${member.stocks.symbol}: score=${parsed.score}, latent_rank=${parsed.latent_rank}, confidence=${parsed.confidence}, bucket=${bucketFromScore(clampScore(Number(parsed.score)))}, sources=${sources.length}, ${aiMs}ms`
      );
    } catch (error) {
      failed++;
      completed++;
      log(
        `AI FAILED [${completed}/${memberRows.length}]`,
        `${member.stocks.symbol}: ${error instanceof Error ? error.message : "unknown"}`
      );
      recordCronError(
        "OpenAI stock rating failed",
        error,
        `Ticker: ${member.stocks.symbol}`
      );
      parsed = {
        ticker: member.stocks.symbol,
        date: runDate,
        score: 0,
        latent_rank: 0.5,
        confidence: 0,
        reason_1s: "Model evaluation unavailable due to an error.",
        risks: ["Data unavailable", "Model error"],
      };
      rawResponse = { error: error instanceof Error ? error.message : "unknown error" };
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
      ? parsed.change?.change_explanation ?? null
      : null;

    // ----- Upsert into ai_analysis_runs -----
    const { data: runRow, error: runError } = await supabase
      .from("ai_analysis_runs")
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
        { onConflict: "batch_id,stock_id" }
      )
      .select("id")
      .single();

    if (runError) {
      log(`DB WRITE FAILED`, `ai_analysis_runs for ${member.stocks.symbol}: ${runError.message}`);
      recordCronError(
        "Supabase analysis upsert failed",
        runError,
        `Ticker: ${member.stocks.symbol}`
      );
      return { ticker: member.stocks.symbol, status: "failed", error: runError.message };
    }

    // ----- Upsert into nasdaq100_recommendations_current -----
    const { error: currentError } = await supabase
      .from("nasdaq100_recommendations_current")
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
        { onConflict: "stock_id" }
      );

    if (currentError) {
      log(`DB WRITE FAILED`, `nasdaq100_recommendations_current for ${member.stocks.symbol}: ${currentError.message}`);
      recordCronError(
        "Supabase current recs upsert failed",
        currentError,
        `Ticker: ${member.stocks.symbol}`
      );
      return { ticker: member.stocks.symbol, status: "failed", error: currentError.message };
    }

    revalidatePath(`/stocks/${member.stocks.symbol.toLowerCase()}`);

    return { ticker: member.stocks.symbol, status: "ok", score, bucket };
  });

  log("AI ANALYSIS COMPLETE", `${completed} done, ${failed} failed`);

  // ----- Step 10: Clean up stale recommendations -----
  const memberIds = memberRows.map((member) => member.stock_id);
  if (memberIds.length) {
    const memberIdsFilter = `(${memberIds.join(",")})`;
    const { error: cleanupError } = await supabase
      .from("nasdaq100_recommendations_current")
      .delete()
      .not("stock_id", "in", memberIdsFilter);

    if (cleanupError) {
      log("CLEANUP FAILED", cleanupError.message);
      recordCronError("Current recs cleanup failed", cleanupError);
      return NextResponse.json({ error: cleanupError.message }, { status: 500 });
    }
    log("CLEANUP OK", "Stale recommendations removed");
  }

  const summary = {
    ok: results.filter((r) => "status" in r && r.status === "ok").length,
    failed: results.filter((r) => "status" in r && r.status === "failed").length,
  };
  const totalSeconds = ((Date.now() - t0) / 1000).toFixed(1);
  log("DONE", `${summary.ok} ok, ${summary.failed} failed, ${totalSeconds}s total`);

    return NextResponse.json({
      runDate,
      total: results.length,
      ok: summary.ok,
      failed: summary.failed,
      elapsedSeconds: Number(totalSeconds),
      results,
    });
  } finally {
    await sendCronSummaryOnce(runDate);
  }
};

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
