import { NextResponse } from 'next/server';
import { getStrategyModelsRanked } from '@/lib/strategy-models-ranked';

export const runtime = 'nodejs';
export const revalidate = 300;

export type { RankedStrategyModel } from '@/lib/strategy-models-ranked';

export async function GET() {
  const strategies = await getStrategyModelsRanked();
  return NextResponse.json({ strategies });
}
