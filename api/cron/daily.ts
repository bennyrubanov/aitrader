import { createHash } from "crypto";
import {
  buildStockRatingPrompt,
  PROMPT_NAME,
  PROMPT_VERSION,
  STOCK_RATING_PROMPT_TEMPLATE,
  STOCK_RATING_SCHEMA,
} from "../../src/lib/aiPrompt";
import { createSupabaseAdminClient } from "../../src/lib/supabaseServer";

const NASDAQ_100_ENDPOINT = "https://api.nasdaq.com/api/quote/list-type/nasdaq100";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5";
const DEFAULT_MODEL_VERSION = process.env.OPENAI_MODEL_VERSION || "unknown";

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

const getRunDate = () => new Date().toISOString().slice(0, 10);

const addDays = (dateString: string, days: number) => {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

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
      deltaIndicator: row.deltaIndicator,
    }))
    .filter((row: NasdaqRow) => row.symbol);
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

const upsertPrompt = async (supabase: ReturnType<typeof createSupabaseAdminClient>) => {
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

const upsertModel = async (supabase: ReturnType<typeof createSupabaseAdminClient>) => {
  const { data, error } = await supabase
    .from("ai_models")
    .upsert(
      {
        provider: "openai",
        name: DEFAULT_MODEL,
        version: DEFAULT_MODEL_VERSION,
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
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  runDate: string,
  symbols: string[]
) => {
  const membershipHash = createHash("sha256")
    .update(symbols.join(","))
    .digest("hex");

  const { data: inserted, error: insertError } = await supabase
    .from("nasdaq100_snapshots")
    .insert(
      { effective_date: runDate, membership_hash: membershipHash },
      { onConflict: "membership_hash", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (inserted?.id) {
    return { id: inserted.id, membershipHash, isNew: true };
  }

  const { data: existing, error: fetchError } = await supabase
    .from("nasdaq100_snapshots")
    .select("id")
    .eq("membership_hash", membershipHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  return { id: existing.id, membershipHash, isNew: false };
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

export default async function handler(req: any, res: any) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const supabase = createSupabaseAdminClient();
  const runDate = getRunDate();
  const yesterdayDate = addDays(runDate, -1);

  let nasdaqRows: NasdaqRow[] = [];
  try {
    nasdaqRows = await fetchNasdaq100();
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Nasdaq fetch failed" });
  }

  if (!nasdaqRows.length) {
    return res.status(500).json({ error: "No Nasdaq 100 symbols available" });
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
    return res.status(500).json({ error: upsertError.message });
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
    return res.status(500).json({ error: rawError.message });
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
      return res.status(500).json({ error: snapshotError.message });
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
    return res.status(500).json({ error: batchError.message });
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
    return res.status(500).json({ error: memberError.message });
  }

  const memberRows = (members || []) as MemberRow[];
  if (!memberRows.length) {
    return res.status(500).json({ error: "No members found for snapshot" });
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

    let parsed;
    let citations: any[] = [];
    let sources: any[] = [];
    let rawResponse: any = null;

    try {
      const response = await requestStockRating(member.stocks, runDate, previous);
      parsed = response.parsed;
      citations = response.citations;
      sources = response.sources;
      rawResponse = response.raw;
    } catch (error: any) {
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
      rawResponse = { error: error?.message || "unknown error" };
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
      return res.status(500).json({ error: cleanupError.message });
    }
  }

  return res.status(200).json({
    runDate,
    total: results.length,
    results,
  });
}
