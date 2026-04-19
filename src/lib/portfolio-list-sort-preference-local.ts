'use client';

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { PortfolioListSortMetric } from '@/lib/portfolio-profile-list-sort';
import {
  PORTFOLIO_LIST_METRIC_OPTION_DETAILS,
  PORTFOLIO_LIST_SIDEBAR_METRIC_OPTION_DETAILS,
} from '@/lib/portfolio-profile-list-sort';

/** Signed-in Your portfolios sidebar sort (persists across visits). */
export const YOUR_PORTFOLIOS_SORT_METRIC_STORAGE_KEY = 'aitrader:your_portfolios_sort_metric_v1';

/** Explore portfolios list sort (persists across visits). */
export const EXPLORE_PORTFOLIOS_SORT_METRIC_STORAGE_KEY = 'aitrader:explore_portfolios_sort_metric_v1';

const exploreSortMetricSet = new Set<PortfolioListSortMetric>(
  PORTFOLIO_LIST_METRIC_OPTION_DETAILS.map((d) => d.value)
);

const yourPortfoliosSortMetricSet = new Set<PortfolioListSortMetric>([
  'follow_order',
  ...PORTFOLIO_LIST_SIDEBAR_METRIC_OPTION_DETAILS.map((d) => d.value),
]);

function readStoredSortMetric(
  key: string,
  coerce: (parsed: string) => PortfolioListSortMetric | null
): PortfolioListSortMetric | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== 'string') return null;
    return coerce(p);
  } catch {
    return null;
  }
}

function coerceYourPortfoliosSortMetric(parsed: string): PortfolioListSortMetric | null {
  if (parsed === 'portfolio_value_performance') return 'portfolio_return';
  if (yourPortfoliosSortMetricSet.has(parsed as PortfolioListSortMetric)) {
    return parsed as PortfolioListSortMetric;
  }
  return null;
}

function coerceExplorePortfoliosSortMetric(parsed: string): PortfolioListSortMetric | null {
  if (exploreSortMetricSet.has(parsed as PortfolioListSortMetric)) {
    return parsed as PortfolioListSortMetric;
  }
  return null;
}

function usePersistedPortfolioListSortMetric(
  storageKey: string,
  defaultMetric: PortfolioListSortMetric,
  coerce: (parsed: string) => PortfolioListSortMetric | null
): [PortfolioListSortMetric, Dispatch<SetStateAction<PortfolioListSortMetric>>] {
  const [metric, setMetric] = useState<PortfolioListSortMetric>(defaultMetric);
  const initialized = useRef(false);
  const coerceRef = useRef(coerce);
  coerceRef.current = coerce;

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const next = readStoredSortMetric(storageKey, (s) => coerceRef.current(s));
      if (next != null) setMetric(next);
      return;
    }
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(storageKey, JSON.stringify(metric));
    } catch {
      /* ignore quota / private mode */
    }
  }, [metric, storageKey]);

  return [metric, setMetric];
}

export function usePersistedYourPortfoliosSortMetric(): [
  PortfolioListSortMetric,
  Dispatch<SetStateAction<PortfolioListSortMetric>>,
] {
  return usePersistedPortfolioListSortMetric(
    YOUR_PORTFOLIOS_SORT_METRIC_STORAGE_KEY,
    'follow_order',
    coerceYourPortfoliosSortMetric
  );
}

export function usePersistedExplorePortfoliosSortMetric(): [
  PortfolioListSortMetric,
  Dispatch<SetStateAction<PortfolioListSortMetric>>,
] {
  return usePersistedPortfolioListSortMetric(
    EXPLORE_PORTFOLIOS_SORT_METRIC_STORAGE_KEY,
    'composite_score',
    coerceExplorePortfoliosSortMetric
  );
}
