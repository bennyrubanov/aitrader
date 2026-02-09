import { NextResponse } from "next/server";
import { createHash } from "crypto";
import {
  buildStockRatingPrompt,
  PROMPT_NAME,
  PROMPT_VERSION,
  STOCK_RATING_PROMPT_TEMPLATE,
  STOCK_RATING_SCHEMA,
} from "@/lib/aiPrompt";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmailByGmail } from "@/lib/sendEmailByGmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASDAQ_100_ENDPOINT = "https://api.nasdaq.com/api/quote/list-type/nasdaq100";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
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

type StockRatingParsed = {
  ticker: string;
  date: string;
  score: number;
  confidence: number;
  reason_1s?: string | null;
  risks?: string[];
  change?: {
    changed_bucket: boolean;
    previous_bucket: "buy" | "hold" | "sell" | null;
    current_bucket: "buy" | "hold" | "sell";
    change_explanation: string | null;
  };
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

const sendCronError = async (subject: string, error: unknown, context?: string) => {
  const errorMessage =
    error instanceof Error ? error.message : JSON.stringify(error, null, 2);

  if (!CRON_ERROR_EMAIL) {
    console.error(subject, context || "", errorMessage);
    return;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #b91c1c;">AITrader Cron Job Error</h2>
      <p><strong>Subject:</strong> ${subject}</p>
      ${context ? `<p><strong>Context:</strong> ${context}</p>` : ""}
      <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${errorMessage}</pre>
    </div>
  `;

  try {
    await sendEmailByGmail(CRON_ERROR_EMAIL, htmlBody, subject);
  } catch (sendError) {
    console.error("Failed to send cron error email", sendError);
  }
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

const fallbackSymbolsFromEnv = (): NasdaqRow[] => {
  const fallback = process.env.NASDAQ_100_FALLBACK;
  if (!fallback) {
    return [];
  }

  return fallback
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean)
    .map((symbol) => ({ symbol, companyName: symbol }));
};

const fetchNasdaq100 = async (): Promise<NasdaqRow[]> => {
  const response = await fetch(NASDAQ_100_ENDPOINT, {
    headers: {
      "user-agent": "Mozilla/5.0 (NASDAQ 100 fetch)",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Nasdaq API error: ${response.status}`);
  }

  const payload = await response.json();
  return parseNasdaqRows(payload);
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

const extractOutputText = (payload: unknown) => {
  if (isRecord(payload) && isString(payload.output_text)) {
    return payload.output_text;
  }

  const output = isRecord(payload) ? payload.output : null;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  output.forEach((item) => {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      return;
    }
    item.content.forEach((contentItem) => {
      if (isRecord(contentItem) && isString(contentItem.text)) {
        chunks.push(contentItem.text);
      }
    });
  });

  return chunks.join("\n").trim();
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

const fetchWithRetry = async (url: string, options: RequestInit, retries = 1) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchWithRetry(url, options, retries - 1);
  }
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

const requestStockRating = async (
  stock: StockRow,
  runDate: string,
  previous: { score?: number | null; bucket?: "buy" | "hold" | "sell" | null }
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = buildStockRatingPrompt({
    ticker: stock.symbol,
    companyName: stock.company_name || stock.symbol,
    runDate,
    yesterdayScore: previous.score ?? null,
    yesterdayBucket: previous.bucket ?? null,
  });

  const response = await fetchWithRetry("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      max_output_tokens: 450,
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
        format: {
          type: "json_schema",
          name: "stock_rating",
          schema: STOCK_RATING_SCHEMA,
          strict: true,
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  if (!outputText) {
    throw new Error("OpenAI response missing output_text");
  }

  const parsed = JSON.parse(outputText);
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
  const auth = isAuthorized(req);
  if (!auth.ok) {
    await sendCronError("Cron authorization failed", auth.reason);
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const supabase = createAdminClient();
  const runDate = getRunDate();
  const yesterdayDate = addDays(runDate, -1);

  let nasdaqRows: NasdaqRow[] = [];
  try {
    nasdaqRows = await fetchNasdaq100();
  } catch (error) {
    await sendCronError("Nasdaq API fetch failed", error);
  }

  if (!nasdaqRows.length) {
    nasdaqRows = fallbackSymbolsFromEnv();
  }

  if (!nasdaqRows.length) {
    return NextResponse.json(
      { error: "No Nasdaq 100 symbols available" },
      { status: 500 }
    );
  }

  const promptRow = await upsertPrompt(supabase);
  const modelRow = await upsertModel(supabase);

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
    await sendCronError("Supabase stock upsert failed", upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const stockMap = new Map(
    (upsertedStocks || []).map((stock: StockRow) => [stock.symbol, stock])
  );

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
    await sendCronError("Failed to store Nasdaq daily raw data", rawError);
    return NextResponse.json({ error: rawError.message }, { status: 500 });
  }

  const symbols = Array.from(new Set(nasdaqRows.map((row) => row.symbol))).sort();
  const snapshot = await createSnapshot(supabase, runDate, symbols);

  if (snapshot.isNew) {
    const snapshotStocks = symbols
      .map((symbol) => stockMap.get(symbol))
      .filter(Boolean)
      .map((stock) => ({
        snapshot_id: snapshot.id,
        stock_id: stock?.id,
      }));

    const { error: snapshotError } = await supabase
      .from("nasdaq100_snapshot_stocks")
      .insert(snapshotStocks);

    if (snapshotError) {
      await sendCronError("Snapshot membership insert failed", snapshotError);
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }
  }

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
    await sendCronError("Batch upsert failed", batchError);
    return NextResponse.json({ error: batchError.message }, { status: 500 });
  }

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
  }

  const { data: members, error: memberError } = await supabase
    .from("nasdaq100_snapshot_stocks")
    .select("stock_id, stocks (id, symbol, company_name)")
    .eq("snapshot_id", snapshot.id);

  if (memberError) {
    await sendCronError("Snapshot members fetch failed", memberError);
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  const memberRows = (members || []) as unknown as MemberRow[];
  if (!memberRows.length) {
    return NextResponse.json({ error: "No members found for snapshot" }, { status: 500 });
  }

  const concurrency = Number(process.env.AI_CONCURRENCY || 4);

  const results = await chunkWithConcurrency(memberRows, concurrency, async (member) => {
    if (!member.stocks) {
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

    try {
      const response = await requestStockRating(member.stocks, runDate, previous);
      parsed = response.parsed;
      citations = response.citations;
      sources = response.sources;
      rawResponse = response.raw;
    } catch (error) {
      await sendCronError(
        "OpenAI stock rating failed",
        error,
        `Ticker: ${member.stocks.symbol}`
      );
      parsed = {
        ticker: member.stocks.symbol,
        date: runDate,
        score: 0,
        confidence: 0,
        reason_1s: "Model evaluation unavailable due to an error.",
        risks: ["Data unavailable", "Model error"],
        change: {
          changed_bucket: false,
          previous_bucket: previous.bucket ?? null,
          current_bucket: "hold",
          change_explanation: null,
        },
      };
      rawResponse = { error: error instanceof Error ? error.message : "unknown error" };
    }

    const score = clampScore(Number(parsed.score));
    const confidence = clampConfidence(Number(parsed.confidence));
    const bucket = bucketFromScore(score);

    const { data: runRow, error: runError } = await supabase
      .from("ai_analysis_runs")
      .upsert(
        {
          batch_id: batchRow.id,
          stock_id: member.stock_id,
          score,
          confidence,
          bucket,
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
      await sendCronError(
        "Supabase analysis upsert failed",
        runError,
        `Ticker: ${member.stocks.symbol}`
      );
      return { ticker: member.stocks.symbol, status: "failed", error: runError.message };
    }

    const { error: currentError } = await supabase
      .from("nasdaq100_recommendations_current")
      .upsert(
        {
          stock_id: member.stock_id,
          latest_run_id: runRow.id,
          score,
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
      await sendCronError(
        "Supabase current recs upsert failed",
        currentError,
        `Ticker: ${member.stocks.symbol}`
      );
      return { ticker: member.stocks.symbol, status: "failed", error: currentError.message };
    }

    return { ticker: member.stocks.symbol, status: "ok", score, bucket };
  });

  const memberIds = memberRows.map((member) => member.stock_id);
  if (memberIds.length) {
    const formattedIds = memberIds.map((id) => `"${id}"`).join(",");
    const { error: cleanupError } = await supabase
      .from("nasdaq100_recommendations_current")
      .delete()
      .not("stock_id", "in", `(${formattedIds})`);

    if (cleanupError) {
      await sendCronError("Current recs cleanup failed", cleanupError);
      return NextResponse.json({ error: cleanupError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    runDate,
    total: results.length,
    results,
  });
};

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
