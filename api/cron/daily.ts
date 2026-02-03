import { buildStockEvaluationPrompt, PROMPT_VERSION } from "../../src/lib/aiPrompt";
import { createSupabaseAdminClient } from "../../src/lib/supabaseServer";

const NASDAQ_100_ENDPOINT = "https://api.nasdaq.com/api/quote/list-type/nasdaq100";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

type NasdaqRow = {
  symbol: string;
  companyName?: string;
  marketCap?: string;
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
};

type StockRecord = {
  id: string;
  symbol: string;
  name?: string | null;
};

const getRunDate = () => new Date().toISOString().slice(0, 10);

const isAuthorized = (req: any) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return true;
  }

  const headerToken =
    req.headers?.["x-cron-secret"] ||
    req.headers?.["x-vercel-cron-secret"] ||
    (req.headers?.authorization || "").replace("Bearer ", "");
  const queryToken = req.query?.secret;
  const token = headerToken || queryToken;
  return token === secret;
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

export default async function handler(req: any, res: any) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
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
    nasdaqRows = fallbackSymbolsFromEnv();
  }

  if (!nasdaqRows.length) {
    return res.status(500).json({ error: "No Nasdaq 100 symbols available" });
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
    return res.status(500).json({ error: upsertError.message });
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
    return res.status(500).json({ error: universeError.message });
  }

  const memberships = (upsertedStocks || []).map((stock: StockRecord) => ({
    universe_id: universeRow.id,
    stock_id: stock.id,
  }));

  const { error: membershipError } = await supabase
    .from("daily_universe_stocks")
    .upsert(memberships, { onConflict: "universe_id,stock_id" });

  if (membershipError) {
    return res.status(500).json({ error: membershipError.message });
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
      return { symbol: row.symbol, status: "failed", error: recError.message };
    }

    return { symbol: row.symbol, status: "ok", rating: evaluation.rating };
  });

  return res.status(200).json({
    runDate,
    total: results.length,
    results,
  });
}
