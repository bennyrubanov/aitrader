import { NextResponse } from "next/server";
import {
  buildStockRatingPrompt,
  PROMPT_NAME,
  PROMPT_VERSION,
  STOCK_RATING_PROMPT_TEMPLATE,
  STOCK_RATING_SCHEMA,
} from "@/lib/aiPrompt";
import { createSupabaseAdminClient } from "@/lib/supabaseServer";
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

type NasdaqStock = {
  id: string;
  ticker: string;
  company_name: string;
};

type DailyRatingRow = {
  stock_id: string;
  score: number;
};

const getRunDate = () => new Date().toISOString().slice(0, 10);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const getWeekStart = (dateString: string) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return formatDate(date);
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

const parseNasdaqRows = (payload: any): NasdaqRow[] => {
  const rows = payload?.data?.data?.rows;
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row: any) => ({
      symbol: row.symbol,
      companyName: row.companyName,
      marketCap: row.marketCap,
      lastSalePrice: row.lastSalePrice,
      netChange: row.netChange,
      percentageChange: row.percentageChange,
      deltaIndicator: row.deltaIndicator,
    }))
    .filter((row: NasdaqRow) => row.symbol);
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

const fetchLatestNasdaq100FromSupabase = async () => {
  const supabase = createSupabaseAdminClient();
  const { data: latestRow, error: latestError } = await supabase
    .from("nasdaq_100_daily")
    .select("run_date")
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError || !latestRow?.run_date) {
    return [];
  }

  const { data, error } = await supabase
    .from("nasdaq_100_daily")
    .select(
      "symbol, company_name, market_cap, last_sale_price, net_change, percentage_change, delta_indicator"
    )
    .eq("run_date", latestRow.run_date);

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    symbol: row.symbol,
    companyName: row.company_name ?? undefined,
    marketCap: row.market_cap ?? undefined,
    lastSalePrice: row.last_sale_price ?? undefined,
    netChange: row.net_change ?? undefined,
    percentageChange: row.percentage_change ?? undefined,
    deltaIndicator: row.delta_indicator ?? undefined,
  }));
};

const upsertPrompt = async (supabase: ReturnType<typeof createSupabaseAdminClient>) => {
  const { data, error } = await supabase
    .from("prompts")
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

const upsertUniverseRun = async (
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  runDate: string,
  promptId: string
) => {
  const { data, error } = await supabase
    .from("universe_runs")
    .upsert(
      {
        run_date: runDate,
        universe: "nasdaq100",
        prompt_id: promptId,
        model: DEFAULT_MODEL,
      },
      { onConflict: "run_date,universe" }
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const extractOutputText = (payload: any) => {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const output = payload?.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const chunks: string[] = [];
  output.forEach((item) => {
    if (!item?.content || !Array.isArray(item.content)) {
      return;
    }
    item.content.forEach((contentItem: any) => {
      if (contentItem?.text) {
        chunks.push(contentItem.text);
      }
    });
  });

  return chunks.join("\n").trim();
};

const uniqueByUrl = (items: any[]) => {
  const map = new Map<string, any>();
  items.forEach((item) => {
    const url = item?.url || item?.link;
    if (!url) {
      return;
    }
    if (!map.has(url)) {
      map.set(url, item);
    }
  });
  return Array.from(map.values());
};

const extractSourcesAndCitations = (payload: any) => {
  const sources: any[] = [];
  const citations: any[] = [];
  const output = payload?.output;

  if (Array.isArray(output)) {
    output.forEach((item) => {
      if (item?.type === "web_search_call" && item?.action?.sources) {
        sources.push(...item.action.sources);
      }

      if (Array.isArray(item?.content)) {
        item.content.forEach((contentItem: any) => {
          if (!Array.isArray(contentItem?.annotations)) {
            return;
          }
          contentItem.annotations.forEach((annotation: any) => {
            if (annotation?.url) {
              citations.push({
                url: annotation.url,
                title: annotation.title || annotation.text || null,
              });
            }
          });
        });
      }
    });
  }

  const normalizedSources = uniqueByUrl(sources);
  const citationFromSources = normalizedSources.map((source) => ({
    url: source.url || source.link,
    title: source.title || source.source || source.snippet || null,
  }));

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

const requestStockRating = async (
  stock: NasdaqStock,
  runDate: string,
  previous: { score?: number | null; bucket?: "buy" | "hold" | "sell" | null }
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = buildStockRatingPrompt({
    ticker: stock.ticker,
    companyName: stock.company_name,
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

  const supabase = createSupabaseAdminClient();
  const runDate = getRunDate();
  const yesterdayDate = addDays(runDate, -1);

  let promptRow;
  try {
    promptRow = await upsertPrompt(supabase);
  } catch (error: any) {
    await sendCronError("Prompt upsert failed", error);
    return NextResponse.json(
      { error: error?.message || "Prompt upsert failed" },
      { status: 500 }
    );
  }

  let runRow;
  try {
    runRow = await upsertUniverseRun(supabase, runDate, promptRow.id);
  } catch (error: any) {
    await sendCronError("Run upsert failed", error);
    return NextResponse.json(
      { error: error?.message || "Run upsert failed" },
      { status: 500 }
    );
  }

  let nasdaqRows: NasdaqRow[] = [];
  try {
    nasdaqRows = await fetchNasdaq100();
    if (!nasdaqRows.length) {
      throw new Error("Nasdaq API returned empty rows");
    }
  } catch (error) {
    await sendCronError("Nasdaq API fetch failed", error);
    nasdaqRows = await fetchLatestNasdaq100FromSupabase();
  }

  if (!nasdaqRows.length) {
    const fallbackRows = fallbackSymbolsFromEnv();
    if (fallbackRows.length) {
      nasdaqRows = fallbackRows;
    }
  }

  if (nasdaqRows.length) {
    const nasdaqDailyPayload = nasdaqRows.map((row) => ({
      run_date: runDate,
      symbol: row.symbol,
      company_name: row.companyName || null,
      market_cap: row.marketCap || null,
      last_sale_price: row.lastSalePrice || null,
      net_change: row.netChange || null,
      percentage_change: row.percentageChange || null,
      delta_indicator: row.deltaIndicator || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: nasdaqUpsertError } = await supabase
      .from("nasdaq_100_daily")
      .upsert(nasdaqDailyPayload, { onConflict: "run_date,symbol" });

    if (nasdaqUpsertError) {
      await sendCronError("Failed to store Nasdaq 100 daily snapshot", nasdaqUpsertError);
    }

    const stockPayload = nasdaqRows.map((row) => ({
      ticker: row.symbol,
      company_name: row.companyName || row.symbol,
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from("nasdaq100_stocks")
      .upsert(stockPayload, { onConflict: "ticker" });

    if (upsertError) {
      await sendCronError("Supabase Nasdaq100 upsert failed", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  } else {
    await sendCronError("No Nasdaq 100 symbols available", "All fallbacks failed.");
  }

  const { data: stocks, error: stockError } = await supabase
    .from("nasdaq100_stocks")
    .select("id, ticker, company_name")
    .order("ticker");

  if (stockError) {
    await sendCronError("Supabase Nasdaq100 fetch failed", stockError);
    return NextResponse.json({ error: stockError.message }, { status: 500 });
  }

  if (!stocks?.length) {
    return NextResponse.json(
      { error: "No Nasdaq-100 stocks available" },
      { status: 500 }
    );
  }

  const stockMap = new Map(stocks.map((stock: NasdaqStock) => [stock.id, stock]));

  const universeMembers = stocks.map((stock) => ({
    run_id: runRow.id,
    stock_id: stock.id,
  }));

  const { error: universeMemberError } = await supabase
    .from("universe_run_stocks")
    .upsert(universeMembers, { onConflict: "run_id,stock_id" });

  if (universeMemberError) {
    await sendCronError("Supabase universe membership upsert failed", universeMemberError);
    return NextResponse.json({ error: universeMemberError.message }, { status: 500 });
  }

  const { data: yesterdayRows } = await supabase
    .from("stock_daily_ratings")
    .select("stock_id, score")
    .eq("date", yesterdayDate);

  const yesterdayMap = new Map<string, { score: number; bucket: "buy" | "hold" | "sell" }>();
  (yesterdayRows || []).forEach((row: DailyRatingRow) => {
    const bucket = bucketFromScore(row.score);
    yesterdayMap.set(row.stock_id, { score: row.score, bucket });
  });

  const concurrency = Number(process.env.AI_CONCURRENCY || 4);

  const results = await chunkWithConcurrency(stocks, concurrency, async (stock) => {
    const previous = yesterdayMap.get(stock.id) || { score: null, bucket: null };

    let parsed;
    let citations: any[] = [];
    let sources: any[] = [];
    let rawResponse: any = null;

    try {
      const response = await requestStockRating(stock, runDate, previous);
      parsed = response.parsed;
      citations = response.citations;
      sources = response.sources;
      rawResponse = response.raw;
    } catch (error: any) {
      await sendCronError(
        "OpenAI stock rating failed",
        error,
        `Ticker: ${stock.ticker}`
      );
      parsed = {
        ticker: stock.ticker,
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
      rawResponse = { error: error?.message || "unknown error" };
    }

    const score = clampScore(Number(parsed.score));
    const confidence = clampConfidence(Number(parsed.confidence));
    const bucket = bucketFromScore(score);

    const { error: insertError } = await supabase
      .from("stock_daily_ratings")
      .upsert(
        {
          run_id: runRow.id,
          stock_id: stock.id,
          date: runDate,
          score,
          confidence,
          reason_1s: parsed.reason_1s || null,
          risks: parsed.risks || [],
          bucket,
          citations,
          sources,
          raw_response: rawResponse,
        },
        { onConflict: "stock_id,date" }
      );

    if (insertError) {
      await sendCronError(
        "Supabase daily rating upsert failed",
        insertError,
        `Ticker: ${stock.ticker}`
      );
      return { ticker: stock.ticker, status: "failed", error: insertError.message };
    }

    const rollupStart = addDays(runDate, -6);
    const { data: scoreRows } = await supabase
      .from("stock_daily_ratings")
      .select("score")
      .eq("stock_id", stock.id)
      .gte("date", rollupStart)
      .lte("date", runDate);

    const scores = (scoreRows || []).map((row) => row.score);
    const avg =
      scores.length > 0
        ? Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(4))
        : null;

    if (avg !== null) {
      const bucket7d = bucketFromScore(avg);
      const { error: rollupError } = await supabase
        .from("stock_score_rollups")
        .upsert(
          {
            stock_id: stock.id,
            date: runDate,
            score_7d_avg: avg,
            bucket_7d: bucket7d,
            window_start: rollupStart,
            window_end: runDate,
            sample_size: scores.length,
          },
          { onConflict: "stock_id,date" }
        );

      if (rollupError) {
        await sendCronError(
          "Supabase score rollup upsert failed",
          rollupError,
          `Ticker: ${stock.ticker}`
        );
        return { ticker: stock.ticker, status: "failed", error: rollupError.message };
      }
    }

    return { ticker: stock.ticker, status: "ok", score, bucket };
  });

  const { data: rollups } = await supabase
    .from("stock_score_rollups")
    .select("stock_id, score_7d_avg")
    .eq("date", runDate);

  const rollupItems = (rollups || [])
    .filter((row) => row.score_7d_avg !== null && row.score_7d_avg !== undefined)
    .map((row) => {
      const stock = stockMap.get(row.stock_id);
      return {
        stock_id: row.stock_id,
        ticker: stock?.ticker || "N/A",
        score_7d_avg: row.score_7d_avg,
      };
    });

  const buildPortfolios = (items: typeof rollupItems) => {
    const bins = [
      { name: "P1", range: "score<=-3", items: [] as typeof rollupItems },
      { name: "P2", range: "-3<score<=0", items: [] as typeof rollupItems },
      { name: "P3", range: "0<score<=3", items: [] as typeof rollupItems },
      { name: "P4", range: "score>3", items: [] as typeof rollupItems },
    ];

    items.forEach((item) => {
      if (item.score_7d_avg <= -3) {
        bins[0].items.push(item);
      } else if (item.score_7d_avg <= 0) {
        bins[1].items.push(item);
      } else if (item.score_7d_avg <= 3) {
        bins[2].items.push(item);
      } else {
        bins[3].items.push(item);
      }
    });

    const merges: string[] = [];

    const mergeAtIndex = (index: number, neighborIndex: number) => {
      const leftIndex = Math.min(index, neighborIndex);
      const rightIndex = Math.max(index, neighborIndex);
      const left = bins[leftIndex];
      const right = bins[rightIndex];
      merges.push(`${left.name}+${right.name}`);
      const merged = {
        name: `${left.name}+${right.name}`,
        range: `${left.range} + ${right.range}`,
        items: [...left.items, ...right.items],
      };
      bins.splice(rightIndex, 1);
      bins.splice(leftIndex, 1, merged);
    };

    const minSize = 5;
    while (bins.length > 1) {
      const smallIndex = bins.findIndex((bin) => bin.items.length < minSize);
      if (smallIndex === -1) {
        break;
      }
      if (smallIndex === 0) {
        mergeAtIndex(0, 1);
      } else if (smallIndex === bins.length - 1) {
        mergeAtIndex(smallIndex - 1, smallIndex);
      } else {
        const leftCount = bins[smallIndex - 1].items.length;
        const rightCount = bins[smallIndex + 1].items.length;
        mergeAtIndex(smallIndex, leftCount <= rightCount ? smallIndex - 1 : smallIndex + 1);
      }
    }

    return { bins, merges };
  };

  const { bins, merges } = buildPortfolios(rollupItems);
  const weekStart = getWeekStart(runDate);
  const portfolioJson = {
    week_start: weekStart,
    method: "paper_bins_7d_avg",
    merges,
    portfolios: bins.map((bin) => ({
      name: bin.name,
      range: bin.range,
      count: bin.items.length,
      constituents: bin.items.map((item) => ({
        stock_id: item.stock_id,
        ticker: item.ticker,
        score_7d_avg: item.score_7d_avg,
      })),
    })),
  };

  const { error: portfolioError } = await supabase
    .from("weekly_portfolios")
    .upsert(
      {
        week_start: weekStart,
        method: "paper_bins_7d_avg",
        portfolio_json: portfolioJson,
        created_at: new Date().toISOString(),
      },
      { onConflict: "week_start" }
    );

  if (portfolioError) {
    await sendCronError("Supabase weekly portfolio upsert failed", portfolioError);
    return NextResponse.json({ error: portfolioError.message }, { status: 500 });
  }

  return NextResponse.json({
    runDate,
    total: results.length,
    weekStart,
    results,
  });
};

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
