type QueryCounterStore = {
  path: string;
  count: number;
  threshold: number;
  startedAt: number;
  finalized: boolean;
};

type AsyncLocalStorageLike<T> = {
  run<R>(store: T, callback: () => R): R;
  getStore(): T | undefined;
};

/**
 * Lazy Node ALS — avoid top-level `require('async_hooks')`, which can break
 * webpack's RSC factory graph. Safe when this module is bundled for the
 * browser: first call returns null and counting is a no-op.
 */
let als: AsyncLocalStorageLike<QueryCounterStore> | null | undefined;

function getAls(): AsyncLocalStorageLike<QueryCounterStore> | null {
  if (als !== undefined) return als;
  als = null;
  if (typeof window !== 'undefined') return null;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const req = eval('require') as (id: string) => {
      AsyncLocalStorage: new <T>() => AsyncLocalStorageLike<T>;
    };
    const { AsyncLocalStorage } = req('async_hooks');
    als = new AsyncLocalStorage<QueryCounterStore>();
  } catch {
    als = null;
  }
  return als;
}

const defaultThreshold = () => {
  const raw = Number(process.env.SUPABASE_QUERY_WARN_THRESHOLD ?? 50);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
};

const shouldThrow = () =>
  process.env.NODE_ENV !== 'production' || process.env.CI === 'true';

export async function runWithSupabaseQueryCount<T>(
  path: string,
  fn: () => Promise<T>,
  threshold = defaultThreshold()
): Promise<T> {
  const a = getAls();
  if (!a) return fn();
  return a.run(
    {
      path,
      count: 0,
      threshold,
      startedAt: Date.now(),
      finalized: false,
    },
    async () => {
      try {
        return await fn();
      } finally {
        finalizeSupabaseQueryCount();
      }
    }
  );
}

function increment(source: string): void {
  const a = getAls();
  if (!a) return;
  const store = a.getStore();
  if (!store) return;
  store.count += 1;
  if (store.count > store.threshold) {
    const message = `[supabase-count] path=${store.path} count=${store.count} source=${source} threshold=${store.threshold}`;
    console.warn(message);
    if (shouldThrow()) {
      throw new Error(`${message} (query guardrail exceeded)`);
    }
  }
}

export function instrumentSupabaseFetch(fetchImpl: typeof fetch, source: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    increment(source);
    return fetchImpl(input, init);
  };
}

export function finalizeSupabaseQueryCount(): void {
  const a = getAls();
  if (!a) return;
  const store = a.getStore();
  if (!store || store.finalized) return;
  store.finalized = true;
  const elapsed = Date.now() - store.startedAt;
  console.info(`[supabase-count] path=${store.path} count=${store.count} elapsed_ms=${elapsed}`);
}
