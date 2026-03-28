import type { OnboardingRebalanceCounts } from '@/lib/onboarding-meta';

export type OnboardingMetaClientPayload = {
  strategies?: unknown[];
  modelInceptionDate?: string | null;
  rebalanceCounts?: OnboardingRebalanceCounts;
};

const cache = new Map<string, OnboardingMetaClientPayload>();
const inflight = new Map<string, Promise<OnboardingMetaClientPayload>>();

function key(slug: string): string {
  return slug.trim();
}

/** Fire-and-forget; warms {@link loadOnboardingMeta} for when the onboarding dialog mounts. */
export function prefetchOnboardingMeta(slug: string): void {
  const k = key(slug);
  if (!k) return;
  void loadOnboardingMeta(k);
}

export function peekOnboardingMetaCache(slug: string): OnboardingMetaClientPayload | undefined {
  const k = key(slug);
  if (!k) return undefined;
  return cache.get(k);
}

export function loadOnboardingMeta(slug: string): Promise<OnboardingMetaClientPayload> {
  const k = key(slug);
  if (!k) return Promise.resolve({});

  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);

  let p = inflight.get(k);
  if (!p) {
    p = fetch(`/api/platform/onboarding-meta?slug=${encodeURIComponent(k)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`onboarding-meta ${r.status}`);
        return (await r.json()) as OnboardingMetaClientPayload;
      })
      .then((d) => {
        cache.set(k, d);
        inflight.delete(k);
        return d;
      })
      .catch(() => {
        inflight.delete(k);
        return {};
      });
    inflight.set(k, p);
  }
  return p;
}
