import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient } from '@/utils/supabase/public';
import { getStrategiesList } from '@/lib/platform-performance-payload';
import type { OnboardingRebalanceCounts } from '@/lib/onboarding-meta';

export const revalidate = 120;

export type { OnboardingRebalanceCounts } from '@/lib/onboarding-meta';

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function quarterKey(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 7);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function computeRebalanceCounts(runDates: string[]): OnboardingRebalanceCounts {
  const days = runDates.map((r) => toDateOnly(r)).filter(Boolean);
  const uniqueDays = Array.from(new Set(days)).sort();
  const weekly = uniqueDays.length;

  const months = new Set(uniqueDays.map((d) => d.slice(0, 7)));
  const quarters = new Set(uniqueDays.map((d) => quarterKey(d)));
  const years = new Set(uniqueDays.map((d) => d.slice(0, 4)));

  return {
    weekly,
    monthly: months.size,
    quarterly: quarters.size,
    yearly: years.size,
  };
}

export async function GET(req: NextRequest) {
  const slugParam = req.nextUrl.searchParams.get('slug');

  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({
      strategies: [],
      selectedSlug: null,
      modelInceptionDate: null,
      rebalanceCounts: { weekly: 0, monthly: 0, quarterly: 0, yearly: 0 },
    });
  }

  const defaultSlug = strategies.find((s) => s.isDefault)?.slug ?? strategies[0].slug;
  const resolvedSlug =
    slugParam && strategies.some((s) => s.slug === slugParam) ? slugParam : defaultSlug;

  const strategyRow = strategies.find((s) => s.slug === resolvedSlug)!;

  const supabase = createPublicClient();

  const [{ data: modelRow }, { data: batches }] = await Promise.all([
    supabase
      .from('strategy_models')
      .select('created_at')
      .eq('id', strategyRow.id)
      .maybeSingle(),
    supabase.from('ai_run_batches').select('run_date').eq('strategy_id', strategyRow.id),
  ]);

  const runDates = ((batches ?? []) as Array<{ run_date: string }>).map((b) => b.run_date);
  const rebalanceCounts = computeRebalanceCounts(runDates);

  const createdAt = (modelRow as { created_at?: string } | null)?.created_at;
  const modelInceptionDate = createdAt ? toDateOnly(createdAt) : null;

  return NextResponse.json({
    strategies: strategies.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      portfolioSize: s.portfolioSize,
      rebalanceFrequency: s.rebalanceFrequency,
      isDefault: s.isDefault,
      sharpeRatio: s.sharpeRatio,
    })),
    selectedSlug: resolvedSlug,
    modelInceptionDate,
    rebalanceCounts,
  });
}
