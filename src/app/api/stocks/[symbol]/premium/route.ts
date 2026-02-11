import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type RouteContext = {
  params: { symbol: string };
};

type HistoryRow = {
  score: number | null;
  confidence: number | null;
  bucket: "buy" | "hold" | "sell" | null;
  reason_1s: string | null;
  risks: unknown;
  bucket_change_explanation: string | null;
  created_at: string | null;
  ai_run_batches:
    | { run_date: string | null }
    | { run_date: string | null }[]
    | null;
};

const toRiskList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
};

export async function GET(_req: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_premium")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_premium) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }

  const symbol = params.symbol.toUpperCase();
  const { data: stockRow } = await supabase
    .from("stocks")
    .select("id")
    .eq("symbol", symbol)
    .maybeSingle();

  if (!stockRow?.id) {
    return NextResponse.json({ error: "Stock not found" }, { status: 404 });
  }

  const { data: historyRows, error: historyError } = await supabase
    .from("ai_analysis_runs")
    .select(
      "score, confidence, bucket, reason_1s, risks, bucket_change_explanation, created_at, ai_run_batches(run_date)"
    )
    .eq("stock_id", stockRow.id)
    .order("created_at", { ascending: true })
    .limit(30);

  if (historyError) {
    return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  const typedHistoryRows = (historyRows ?? []) as HistoryRow[];
  const history = typedHistoryRows.map((row) => {
    const runDate = Array.isArray(row.ai_run_batches)
      ? row.ai_run_batches[0]?.run_date
      : row.ai_run_batches?.run_date;
    const date =
      typeof runDate === "string" ? runDate : row.created_at?.slice(0, 10) ?? "";

    return {
      date,
      score: typeof row.score === "number" ? row.score : null,
      bucket: row.bucket ?? null,
      confidence:
        row.confidence === null || row.confidence === undefined
          ? null
          : Number(row.confidence),
      summary: row.reason_1s ?? null,
      risks: toRiskList(row.risks),
      changeExplanation: row.bucket_change_explanation ?? null,
    };
  });

  return NextResponse.json({ history });
}
