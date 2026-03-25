import { NextResponse } from 'next/server';
import type { SubscriptionTier } from '@/lib/auth-state';
import { allowedStrategyIdsForSubscriptionTier } from '@/lib/strategy-plan-access';
import { STRATEGY_CONFIG } from '@/lib/strategyConfig';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

type RouteContext = {
  params: Promise<{ symbol: string }>;
};

type RpcHistoryRow = {
  score: number;
  confidence: number | null;
  bucket: string;
  reason_1s: string | null;
  risks: unknown;
  bucket_change_explanation: string | null;
  created_at: string;
  run_date: string;
};

const toRiskList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
};

export async function GET(_req: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('subscription_tier')
    .eq('id', userData.user.id)
    .maybeSingle();

  const rawTier = profile?.subscription_tier;
  const subscriptionTier: SubscriptionTier =
    rawTier === 'supporter' || rawTier === 'outperformer' ? rawTier : 'free';

  const resolvedParams = await params;
  const symbol = resolvedParams.symbol.toUpperCase();

  const admin = createAdminClient();

  const { data: stockRow } = await admin
    .from('stocks')
    .select('id, is_premium_stock')
    .eq('symbol', symbol)
    .maybeSingle();

  if (!stockRow?.id) {
    return NextResponse.json({ error: 'Stock not found' }, { status: 404 });
  }

  if (subscriptionTier === 'free' && stockRow.is_premium_stock) {
    return NextResponse.json({ error: 'Supporter or Outperformer plan required' }, { status: 403 });
  }

  const { data: strategies, error: stratErr } = await admin
    .from('strategy_models')
    .select('id, minimum_plan_tier, slug, is_default')
    .eq('status', 'active');

  if (stratErr) {
    return NextResponse.json({ error: stratErr.message }, { status: 500 });
  }

  let allowedStrategyIds: string[];
  if (subscriptionTier === 'free') {
    const list = strategies ?? [];
    const bySlug = list.find((s) => s.slug === STRATEGY_CONFIG.slug);
    const byDefault = list.find((s) => s.is_default === true);
    const defaultId = bySlug?.id ?? byDefault?.id;
    allowedStrategyIds = defaultId ? [defaultId] : [];
  } else {
    allowedStrategyIds = allowedStrategyIdsForSubscriptionTier(strategies ?? [], subscriptionTier);
  }

  if (allowedStrategyIds.length === 0) {
    return NextResponse.json({ history: [] });
  }

  const { data: rpcRows, error: rpcErr } = await admin.rpc('stock_ai_analysis_history_for_strategies', {
    p_stock_id: stockRow.id,
    p_strategy_ids: allowedStrategyIds,
    p_limit: 30,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  const rows = (rpcRows ?? []) as RpcHistoryRow[];
  const chronological = [...rows].reverse();

  const history = chronological.map((row) => {
    const date =
      typeof row.run_date === 'string' ? row.run_date : row.created_at?.slice(0, 10) ?? '';

    return {
      date,
      score: typeof row.score === 'number' ? row.score : null,
      bucket: (row.bucket as 'buy' | 'hold' | 'sell') ?? null,
      confidence:
        row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
      summary: row.reason_1s ?? null,
      risks: toRiskList(row.risks),
      changeExplanation: row.bucket_change_explanation ?? null,
    };
  });

  return NextResponse.json({ history });
}
