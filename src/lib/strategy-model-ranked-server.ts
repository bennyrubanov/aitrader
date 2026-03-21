import type { RankedConfig } from '@/app/api/platform/portfolio-configs-ranked/route';

export type PortfolioBeatRates = {
  pctBeatingNasdaqCap: number | null;
  pctBeatingSp500: number | null;
  comparableNasdaq: number;
  beatingNasdaq: number;
  comparableSp500: number;
  beatingSp500: number;
};

function computeBeatRates(configs: RankedConfig[]): PortfolioBeatRates {
  const nasdaqComparable = configs.filter((c) => c.metrics.beatsMarket !== null);
  const spComparable = configs.filter((c) => c.metrics.beatsSp500 !== null);
  const beatingNasdaq = nasdaqComparable.filter((c) => c.metrics.beatsMarket === true).length;
  const beatingSp500 = spComparable.filter((c) => c.metrics.beatsSp500 === true).length;
  const comparableNasdaq = nasdaqComparable.length;
  const comparableSp500 = spComparable.length;
  const pctBeatingNasdaqCap =
    comparableNasdaq > 0 ? Math.round((1000 * beatingNasdaq) / comparableNasdaq) / 10 : null;
  const pctBeatingSp500 =
    comparableSp500 > 0 ? Math.round((1000 * beatingSp500) / comparableSp500) / 10 : null;
  return {
    pctBeatingNasdaqCap,
    pctBeatingSp500,
    comparableNasdaq,
    beatingNasdaq,
    comparableSp500,
    beatingSp500,
  };
}

/**
 * Aggregate outperformance rates across all portfolio construction configs (Layer B) for a strategy slug.
 */
export async function getPortfolioBeatRatesForSlug(slug: string): Promise<PortfolioBeatRates | null> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://127.0.0.1:3000');

  try {
    const res = await fetch(
      `${base}/api/platform/portfolio-configs-ranked?slug=${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { configs?: RankedConfig[] };
    const configs = data.configs ?? [];
    if (configs.length === 0) return null;
    return computeBeatRates(configs);
  } catch {
    return null;
  }
}
