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

function loadAsyncLocalStorage(): AsyncLocalStorageLike<QueryCounterStore> | null {
  // Keep this dynamic so browser/client bundles do not try to resolve Node built-ins.
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  try {
    const req = eval('require') as (id: string) => {
      AsyncLocalStorage: new <T>() => AsyncLocalStorageLike<T>;
    };
    const { AsyncLocalStorage } = req('async_hooks');
    return new AsyncLocalStorage<QueryCounterStore>();
  } catch {
    return null;
  }
}

const als = loadAsyncLocalStorage();

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
  if (!als) return fn();
  return als.run(
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
  const store = als?.getStore();
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
  const store = als?.getStore();
  if (!store || store.finalized) return;
  store.finalized = true;
  const elapsed = Date.now() - store.startedAt;
  console.info(`[supabase-count] path=${store.path} count=${store.count} elapsed_ms=${elapsed}`);
}
