import { NextResponse } from 'next/server';
import { canAccessPaidPortfolioHoldings, canAccessStrategySlugPaidData } from '@/lib/app-access';
import {
  appAccessForAuthedUser,
  fetchSubscriptionTierForUser,
  paidHoldingsPlanRequiredResponse,
  strategyModelNotOnPlanResponse,
} from '@/lib/server-entitlements';
import {
  getHoldingsForStrategy,
  getPortfolioRunDates,
  getStrategiesList,
} from '@/lib/platform-performance-payload';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { tier, errorMessage } = await fetchSubscriptionTierForUser(supabase, user.id);
  if (errorMessage) {
    return NextResponse.json({ error: 'Unable to verify plan access.' }, { status: 500 });
  }

  const access = appAccessForAuthedUser(tier);

  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get('date');
  const slugParam = searchParams.get('slug');

  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({ error: 'No strategies available.' }, { status: 404 });
  }

  const bySlug = slugParam ? strategies.find((s) => s.slug === slugParam) : undefined;
  const bestStrategy = bySlug ?? strategies[0];

  if (!canAccessPaidPortfolioHoldings(access)) {
    return paidHoldingsPlanRequiredResponse();
  }
  if (!canAccessStrategySlugPaidData(access, bestStrategy.slug)) {
    return strategyModelNotOnPlanResponse();
  }

  const dates = await getPortfolioRunDates(bestStrategy.id);
  if (!dates.length) {
    return NextResponse.json({
      strategy: bestStrategy,
      holdings: [],
      availableDates: [],
      selectedDate: null,
    });
  }

  const selectedDate = requestedDate && dates.includes(requestedDate) ? requestedDate : dates[0];
  const holdings = await getHoldingsForStrategy(bestStrategy.id, selectedDate);

  return NextResponse.json({
    strategy: bestStrategy,
    holdings,
    availableDates: dates,
    selectedDate,
    runDate: selectedDate,
  });
}
