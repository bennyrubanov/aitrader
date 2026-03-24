import type { PortfolioConfig, RebalanceFrequency, RiskLevel, WeightingMethod } from './portfolio-config-shared';
import { DEFAULT_PORTFOLIO_CONFIG } from './portfolio-config-shared';

const STORAGE_KEY = 'aitrader:portfolio_config';
const ONBOARDING_KEY = 'aitrader:portfolio_onboarding_done';
const ENTRY_DATE_KEY = 'aitrader:portfolio_entry_date';
/** Guest completes onboarding picks; after sign-up we POST this to `/api/platform/user-portfolio-profile`. */
const PENDING_GUEST_PORTFOLLOW_KEY = 'aitrader:pending_guest_portfollow_v1';

const YMD_PENDING_RE = /^\d{4}-\d{2}-\d{2}$/;

export type PendingGuestPortfolioFollowPayload = {
  strategySlug: string;
  riskLevel: number;
  frequency: string;
  weighting: string;
  investmentSize: number;
  userStartDate: string;
  startingPortfolio: boolean;
};

function isValidPendingGuestPayload(p: unknown): p is PendingGuestPortfolioFollowPayload {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  const strategySlug = o.strategySlug;
  const riskLevel = Number(o.riskLevel);
  const frequency = o.frequency;
  const weighting = o.weighting;
  const investmentSize = Number(o.investmentSize);
  const userStartDate = o.userStartDate;
  const startingPortfolio = o.startingPortfolio;
  if (typeof strategySlug !== 'string' || !strategySlug.trim()) return false;
  if (!Number.isFinite(riskLevel) || riskLevel < 1 || riskLevel > 6) return false;
  if (typeof frequency !== 'string' || !['weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency))
    return false;
  if (typeof weighting !== 'string' || !['equal', 'cap'].includes(weighting)) return false;
  if (!Number.isFinite(investmentSize) || investmentSize <= 0) return false;
  if (typeof userStartDate !== 'string' || !YMD_PENDING_RE.test(userStartDate.trim())) return false;
  if (startingPortfolio !== true) return false;
  return true;
}

export function writePendingGuestPortfolioFollow(payload: PendingGuestPortfolioFollowPayload): void {
  try {
    localStorage.setItem(PENDING_GUEST_PORTFOLLOW_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** Keeps pending signup POST in sync with local guest state (continue-as-guest + entry settings). */
export function syncPendingGuestPortfolioFollowForGuestLocal(
  config: PortfolioConfig,
  userStartDateYmd: string
): void {
  const y = userStartDateYmd.trim();
  if (!YMD_PENDING_RE.test(y)) return;
  const slug = typeof config.strategySlug === 'string' ? config.strategySlug.trim() : '';
  if (!slug) return;
  writePendingGuestPortfolioFollow({
    strategySlug: slug,
    riskLevel: config.riskLevel,
    frequency: config.rebalanceFrequency,
    weighting: config.weightingMethod,
    investmentSize: config.investmentSize,
    userStartDate: y,
    startingPortfolio: true,
  });
}

export function readPendingGuestPortfolioFollow(): PendingGuestPortfolioFollowPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_GUEST_PORTFOLLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPendingGuestPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingGuestPortfolioFollow(): void {
  try {
    localStorage.removeItem(PENDING_GUEST_PORTFOLLOW_KEY);
  } catch {
    // ignore
  }
}
/** Signed-in users: mirrors `user_profiles.portfolio_onboarding_done` (validated when auth hydrates). */
const ONBOARDING_DONE_CACHE_KEY = 'aitrader:portfolio_onboarding_cache_v1';

export type OnboardingDoneCache = { userId: string; done: boolean };

export { ONBOARDING_KEY, ENTRY_DATE_KEY };

export function readOnboardingDoneCache(): OnboardingDoneCache | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_DONE_CACHE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object') return null;
    const userId = (p as { userId?: unknown }).userId;
    const done = (p as { done?: unknown }).done;
    if (typeof userId !== 'string' || userId.length === 0) return null;
    if (typeof done !== 'boolean') return null;
    return { userId, done };
  } catch {
    return null;
  }
}

export function writeOnboardingDoneCache(userId: string, done: boolean): void {
  try {
    localStorage.setItem(ONBOARDING_DONE_CACHE_KEY, JSON.stringify({ userId, done }));
  } catch {
    // ignore
  }
}

export function clearOnboardingDoneCache(): void {
  try {
    localStorage.removeItem(ONBOARDING_DONE_CACHE_KEY);
  } catch {
    // ignore
  }
}

function isValidRiskLevel(v: unknown): v is RiskLevel {
  return [1, 2, 3, 4, 5, 6].includes(v as number);
}

function isValidFrequency(v: unknown): v is RebalanceFrequency {
  return ['weekly', 'monthly', 'quarterly', 'yearly'].includes(v as string);
}

function isValidWeighting(v: unknown): v is WeightingMethod {
  return ['equal', 'cap'].includes(v as string);
}

export function loadPortfolioConfigFromStorage(): PortfolioConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      !isValidRiskLevel(parsed.riskLevel) ||
      !isValidFrequency(parsed.rebalanceFrequency) ||
      !isValidWeighting(parsed.weightingMethod) ||
      typeof parsed.investmentSize !== 'number' ||
      parsed.investmentSize <= 0
    ) {
      return null;
    }
    const strategySlug =
      typeof parsed.strategySlug === 'string' && parsed.strategySlug.length > 0
        ? parsed.strategySlug
        : DEFAULT_PORTFOLIO_CONFIG.strategySlug;
    return {
      strategySlug,
      riskLevel: parsed.riskLevel,
      rebalanceFrequency: parsed.rebalanceFrequency,
      weightingMethod: parsed.weightingMethod,
      investmentSize: parsed.investmentSize,
    };
  } catch {
    return null;
  }
}

export function savePortfolioConfigToStorage(config: PortfolioConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

export function clearStoredPortfolioConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
