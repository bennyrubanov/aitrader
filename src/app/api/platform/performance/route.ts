import { NextResponse } from "next/server";
import { createPublicClient } from "@/utils/supabase/public";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CACHE_CONTROL_HEADER = "public, s-maxage=300, stale-while-revalidate=1800";

type BatchRow = {
  id: string;
  run_date: string;
};

type AnalysisRow = {
  batch_id: string;
  bucket: "buy" | "hold" | "sell" | null;
  stocks: { symbol: string } | { symbol: string }[] | null;
};

type RawRow = {
  run_date: string;
  symbol: string;
  percentage_change: string | null;
};

type Sp500CsvRow = {
  date: string;
  close: number;
};

const FALLBACK_POINTS = 30;
const MAX_DAYS = 120;

const parsePercentage = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.replaceAll("%", "").replaceAll(",", "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: number[]) => {
  if (!values.length) {
    return null;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
};

const buildFallbackSeries = () => {
  const points: { date: string; aiTrader: number; sp500: number }[] = [];
  let aiTrader = 100;
  let sp500 = 100;

  for (let index = FALLBACK_POINTS - 1; index >= 0; index--) {
    const date = new Date();
    date.setDate(date.getDate() - index);

    const aiDrift = 0.22 + Math.sin(index / 3) * 0.15;
    const spDrift = 0.14 + Math.cos(index / 4) * 0.1;

    aiTrader *= 1 + aiDrift / 100;
    sp500 *= 1 + spDrift / 100;

    points.push({
      date: date.toISOString().slice(0, 10),
      aiTrader: Number(aiTrader.toFixed(2)),
      sp500: Number(sp500.toFixed(2)),
    });
  }

  return points;
};

const fetchSp500Rows = async (): Promise<Sp500CsvRow[] | null> => {
  try {
    const response = await fetch("https://stooq.com/q/d/l/?s=%5Espx&i=d", {
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const csv = await response.text();
    const lines = csv.trim().split("\n");
    if (lines.length < 2) {
      return null;
    }

    const rows = lines
      .slice(1)
      .map((line) => {
        const [date, _open, _high, _low, close] = line.split(",");
        const closeValue = Number(close);
        if (!date || !Number.isFinite(closeValue)) {
          return null;
        }
        return { date, close: closeValue };
      })
      .filter((row): row is Sp500CsvRow => Boolean(row))
      .sort((a, b) => a.date.localeCompare(b.date));

    return rows.length ? rows : null;
  } catch {
    return null;
  }
};

const buildSp500CloseMap = (runDates: string[], spRows: Sp500CsvRow[]) => {
  const closeByRunDate = new Map<string, number>();

  let rowIndex = 0;
  let latestClose: number | null = null;

  for (const runDate of runDates) {
    while (rowIndex < spRows.length && spRows[rowIndex].date <= runDate) {
      latestClose = spRows[rowIndex].close;
      rowIndex += 1;
    }

    if (latestClose !== null) {
      closeByRunDate.set(runDate, latestClose);
    }
  }

  return closeByRunDate;
};

export async function GET() {
  try {
    const toCachedJson = (series: { date: string; aiTrader: number; sp500: number }[]) =>
      NextResponse.json(
        { series },
        {
          headers: {
            "Cache-Control": CACHE_CONTROL_HEADER,
          },
        }
      );

    const supabase = createPublicClient();

    const { data: batches, error: batchError } = await supabase
      .from("ai_run_batches")
      .select("id, run_date")
      .eq("index_name", "nasdaq100")
      .order("run_date", { ascending: true })
      .limit(MAX_DAYS);

    if (batchError || !batches?.length) {
      return toCachedJson(buildFallbackSeries());
    }

    const typedBatches = batches as BatchRow[];
    const batchIdToDate = new Map(typedBatches.map((row) => [row.id, row.run_date]));
    const runDates = Array.from(new Set(typedBatches.map((row) => row.run_date))).sort();

    if (!runDates.length) {
      return toCachedJson(buildFallbackSeries());
    }

    const batchIds = typedBatches.map((row) => row.id);

    const [analysisResponse, rawResponse] = await Promise.all([
      supabase
        .from("ai_analysis_runs")
        .select("batch_id, bucket, stocks(symbol)")
        .in("batch_id", batchIds),
      supabase
        .from("nasdaq_100_daily_raw")
        .select("run_date, symbol, percentage_change")
        .in("run_date", runDates),
    ]);

    if (analysisResponse.error || rawResponse.error) {
      return toCachedJson(buildFallbackSeries());
    }

    const analysisRows = (analysisResponse.data ?? []) as AnalysisRow[];
    const rawRows = (rawResponse.data ?? []) as RawRow[];

    const buySymbolsByDate = new Map<string, Set<string>>();
    for (const run of analysisRows) {
      if (run.bucket !== "buy") {
        continue;
      }

      const runDate = batchIdToDate.get(run.batch_id);
      const stock = Array.isArray(run.stocks) ? run.stocks[0] : run.stocks;
      if (!runDate || !stock?.symbol) {
        continue;
      }

      if (!buySymbolsByDate.has(runDate)) {
        buySymbolsByDate.set(runDate, new Set<string>());
      }
      buySymbolsByDate.get(runDate)?.add(stock.symbol);
    }

    const changeByDateAndSymbol = new Map<string, number>();
    const allChangesByDate = new Map<string, number[]>();

    for (const row of rawRows) {
      const change = parsePercentage(row.percentage_change);
      if (change === null) {
        continue;
      }

      changeByDateAndSymbol.set(`${row.run_date}::${row.symbol}`, change);
      if (!allChangesByDate.has(row.run_date)) {
        allChangesByDate.set(row.run_date, []);
      }
      allChangesByDate.get(row.run_date)?.push(change);
    }

    const aiDailyReturnByDate = new Map<string, number>();
    const marketProxyReturnByDate = new Map<string, number>();

    for (const runDate of runDates) {
      const buySymbols = Array.from(buySymbolsByDate.get(runDate) ?? []);
      const buyReturns = buySymbols
        .map((symbol) => changeByDateAndSymbol.get(`${runDate}::${symbol}`))
        .filter((value): value is number => typeof value === "number");

      const aiReturn = average(buyReturns);
      aiDailyReturnByDate.set(runDate, aiReturn ?? 0);

      const marketProxy = average(allChangesByDate.get(runDate) ?? []);
      marketProxyReturnByDate.set(runDate, marketProxy ?? 0);
    }

    let aiTrader = 100;
    let sp500 = 100;
    let previousSpClose: number | null = null;

    const spRows = await fetchSp500Rows();
    const spCloseByDate = spRows ? buildSp500CloseMap(runDates, spRows) : null;

    const series = runDates.map((runDate) => {
      const aiDailyReturn = aiDailyReturnByDate.get(runDate) ?? 0;
      aiTrader *= 1 + aiDailyReturn / 100;

      const spClose = spCloseByDate?.get(runDate);
      if (typeof spClose === "number" && previousSpClose && previousSpClose > 0) {
        sp500 *= 1 + (spClose - previousSpClose) / previousSpClose;
      } else {
        const marketProxyReturn = marketProxyReturnByDate.get(runDate) ?? 0;
        sp500 *= 1 + marketProxyReturn / 100;
      }

      if (typeof spClose === "number") {
        previousSpClose = spClose;
      }

      return {
        date: runDate,
        aiTrader: Number(aiTrader.toFixed(2)),
        sp500: Number(sp500.toFixed(2)),
      };
    });

    return toCachedJson(series);
  } catch {
    return NextResponse.json(
      { series: buildFallbackSeries() },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL_HEADER,
        },
      }
    );
  }
}
