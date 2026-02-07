import { NextResponse } from "next/server";
import { buildStockEvaluationPrompt, PROMPT_VERSION } from "@/lib/aiPrompt";
import { createSupabaseAdminClient } from "@/lib/supabaseServer";
import { sendEmailByGmail } from "@/lib/sendEmailByGmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NASDAQ_100_ENDPOINT = "https://api.nasdaq.com/api/quote/list-type/nasdaq100";
const DEFAULT_MODEL = process.env.OPENAI_MODEL;
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

type StockRecord = {
  id: string;
  symbol: string;
  name?: string | null;
};

const getRunDate = () => new Date().toISOString().slice(0, 10);

const sendCronError = async (subject: string, error: unknown, context?: string) => {
  const errorMessage =
    error instanceof Error ? error.message : JSON.stringify(error, null, 2);
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2 style="color: #b91c1c;">AITrader Cron Job Error</h2>
      <p><strong>Subject:</strong> ${subject}</p>
      ${context ? `<p><strong>Context:</strong> ${context}</p>` : ""}
      <pre style="background:#f8fafc;padding:12px;border-radius:8px;">${errorMessage}</pre>
    </div>
  `;

  await sendEmailByGmail(CRON_ERROR_EMAIL, htmlBody, subject);
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

const extractOutputText = (payload: any) => {
  if (payload?.output_text) {
    return payload.output_text as string;
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
      if (contentItem?.type === "output_text" && contentItem?.text) {
        chunks.push(contentItem.text);
      }
      if (contentItem?.text) {
        chunks.push(contentItem.text);
      }
    });
  });

  return chunks.join("\n").trim();
};

const safeJsonParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const normalizeRating = (rating: string | undefined) => {
  const normalized = (rating || "").toLowerCase();
  if (normalized.includes("buy")) {
    return "buy";
  }
  if (normalized.includes("sell")) {
    return "sell";
  }
  return "hold";
};

const requestStockEvaluation = async (
  stock: NasdaqRow,
  previous: { rating?: string | null; summary?: string | null } | null
) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const prompt = buildStockEvaluationPrompt({
    symbol: stock.symbol,
    name: stock.companyName,
    asOfDate: getRunDate(),
    previousRating: previous?.rating,
    previousSummary: previous?.summary,
    marketData: {
      lastSalePrice: stock.lastSalePrice,
      netChange: stock.netChange,
      percentageChange: stock.percentageChange,
      marketCap: stock.marketCap,
    },
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      max_output_tokens: 650,
      response_format: { type: "json_object" },
      input: [
        {
          role: "system",
          content:
            "You are an investment analyst. Reply only with valid JSON that matches the requested schema.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  const parsed = safeJsonParse(outputText);

  if (!parsed) {
    throw new Error(`OpenAI response parse failed: ${outputText.slice(0, 500)}`);
  }

  return {
    rating: normalizeRating(parsed.rating),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    summary: parsed.summary || null,
    reasoning: parsed.reasoning || null,
    changeSummary: parsed.change_summary || null,
    drivers: parsed.drivers || [],
    risks: parsed.risks || [],
    sources: parsed.sources || [],
    rawResponse: parsed,
  };
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
    } else {
      await sendCronError("No Nasdaq 100 symbols available", "All fallbacks failed.");
      return NextResponse.json(
        { error: "No Nasdaq 100 symbols available" },
        { status: 500 }
      );
    }
  }

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
    symbol: row.symbol,
    name: row.companyName || row.symbol,
    exchange: "NASDAQ",
    is_active: true,
    updated_at: new Date().toISOString(),
  }));

  const { data: upsertedStocks, error: upsertError } = await supabase
    .from("stocks")
    .upsert(stockPayload, { onConflict: "symbol" })
    .select("id, symbol, name");

  if (upsertError) {
    await sendCronError("Supabase stock upsert failed", upsertError);
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const stockMap = new Map(
    (upsertedStocks || []).map((stock: StockRecord) => [stock.symbol, stock])
  );

  const { data: universeRow, error: universeError } = await supabase
    .from("daily_universes")
    .upsert({ run_date: runDate, source: "nasdaq-100" }, { onConflict: "run_date,source" })
    .select("id")
    .single();

  if (universeError) {
    await sendCronError("Supabase universe upsert failed", universeError);
    return NextResponse.json({ error: universeError.message }, { status: 500 });
  }

  const memberships = (upsertedStocks || []).map((stock: StockRecord) => ({
    universe_id: universeRow.id,
    stock_id: stock.id,
  }));

  const { error: membershipError } = await supabase
    .from("daily_universe_stocks")
    .upsert(memberships, { onConflict: "universe_id,stock_id" });

  if (membershipError) {
    await sendCronError("Supabase universe membership upsert failed", membershipError);
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  const concurrency = Number(process.env.AI_CONCURRENCY || 4);

  const results = await chunkWithConcurrency(nasdaqRows, concurrency, async (row) => {
    const stock = stockMap.get(row.symbol);
    if (!stock) {
      return { symbol: row.symbol, status: "missing_stock" };
    }

    const { data: previousRecommendation } = await supabase
      .from("stock_recommendations")
      .select("rating, summary, run_date")
      .eq("stock_id", stock.id)
      .order("run_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    let evaluation;
    try {
      evaluation = await requestStockEvaluation(row, previousRecommendation);
    } catch (error: any) {
      await sendCronError(
        "OpenAI evaluation failed",
        error,
        `Symbol: ${row.symbol}`
      );
      evaluation = {
        rating: "hold",
        confidence: 0.1,
        summary: "Model evaluation unavailable.",
        reasoning: `OpenAI error: ${error?.message || "unknown error"}`,
        changeSummary: "Recommendation held due to missing evaluation.",
        drivers: [],
        risks: [],
        sources: [],
        rawResponse: { error: error?.message || "unknown error" },
      };
    }

    const { error: recError } = await supabase
      .from("stock_recommendations")
      .upsert(
        {
          stock_id: stock.id,
          run_date: runDate,
          rating: evaluation.rating,
          confidence: evaluation.confidence,
          summary: evaluation.summary,
          reasoning: evaluation.reasoning,
          change_summary: evaluation.changeSummary,
          drivers: evaluation.drivers,
          risks: evaluation.risks,
          sources: evaluation.sources,
          model: DEFAULT_MODEL,
          prompt_version: PROMPT_VERSION,
          raw_response: evaluation.rawResponse,
        },
        { onConflict: "stock_id,run_date" }
      );

    if (recError) {
      await sendCronError(
        "Supabase stock recommendation upsert failed",
        recError,
        `Symbol: ${row.symbol}`
      );
      return { symbol: row.symbol, status: "failed", error: recError.message };
    }

    return { symbol: row.symbol, status: "ok", rating: evaluation.rating };
  });

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
