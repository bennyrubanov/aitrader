import { NextResponse } from 'next/server';
import {
  getStrategiesList,
  getHoldingsForStrategy,
  getPortfolioRunDates,
} from '@/lib/platform-performance-payload';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const requestedDate = searchParams.get('date');
  const slugParam = searchParams.get('slug');

  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({ error: 'No strategies available.' }, { status: 404 });
  }

  const bySlug = slugParam ? strategies.find((s) => s.slug === slugParam) : undefined;
  const bestStrategy = bySlug ?? strategies[0];

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
