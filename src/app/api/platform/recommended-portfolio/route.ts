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

  const strategies = await getStrategiesList();
  if (!strategies.length) {
    return NextResponse.json({ error: 'No strategies available.' }, { status: 404 });
  }

  const bestStrategy = strategies[0];

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
  });
}
