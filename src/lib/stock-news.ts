import { unstable_cache } from 'next/cache';

/** Bump when feed URLs or merge logic changes (invalidates cached payloads). */
const STOCK_NEWS_SOURCES_VERSION = 'v3';

const RAW_CAP_PER_FEED = 25;
const OUTPUT_LIMIT = 8;
const MAX_ITEM_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SNIPPET_MAX = 160;

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 AITrader/1.0 (stock news; +https://tryaitrader.com)',
};

export type StockNewsItem = {
  title: string;
  link: string;
  source: string | null;
  /** RFC 2822 or ISO string from RSS, or null */
  publishedAt: string | null;
  snippet: string | null;
};

type ParsedCandidate = {
  title: string;
  link: string;
  source: string | null;
  publishedAt: string | null;
  snippet: string | null;
  publishedMs: number;
  /** Yahoo headline feed is ticker-scoped; skip strict Google-style relevance filter */
  fromTickerScopedFeed: boolean;
};

const COMPANY_NOISE = new Set([
  'and',
  'co',
  'corp',
  'corporation',
  'group',
  'holdings',
  'inc',
  'llc',
  'ltd',
  'nv',
  'plc',
  'sa',
  'the',
]);

const decodeXmlEntities = (value: string) =>
  value
    .replaceAll('&amp;', '&')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

function unwrapCdata(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('<![CDATA[') && t.endsWith(']]>')) {
    return t.slice(9, -3);
  }
  return t;
}

function extractTagContent(xmlBlock: string, tagName: string): string | null {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xmlBlock.match(re);
  const inner = match?.[1]?.trim();
  return inner ?? null;
}

function extractSourceTag(itemXml: string): string | null {
  const raw = extractTagContent(itemXml, 'source');
  if (!raw) {
    return null;
  }
  return decodeXmlEntities(unwrapCdata(raw)).trim() || null;
}

function parseNewsSourceFromTitle(title: string): { cleanTitle: string; source: string | null } {
  const enDash = ' – ';
  const sep = title.includes(enDash) ? enDash : ' - ';
  const parts = title.split(sep);
  if (parts.length < 2) {
    return { cleanTitle: title, source: null };
  }
  const source = parts[parts.length - 1]?.trim() ?? null;
  if (!source) {
    return { cleanTitle: title, source: null };
  }
  const cleanTitle = title.slice(0, -(source.length + sep.length)).trim();
  return { cleanTitle: cleanTitle || title, source };
}

/** Known domains → display names (Yahoo RSS has no &lt;source&gt;; dedupe can drop Google's source). */
const SOURCE_BY_HOST: Record<string, string> = {
  '247wallst.com': '247WallSt',
  'barrons.com': "Barron's",
  'benzinga.com': 'Benzinga',
  'bloomberg.com': 'Bloomberg',
  'businessinsider.com': 'Business Insider',
  'cnbc.com': 'CNBC',
  'cnn.com': 'CNN',
  'finance.yahoo.com': 'Yahoo Finance',
  'fool.com': 'The Motley Fool',
  'investopedia.com': 'Investopedia',
  'investors.com': "Investor's Business Daily",
  'marketwatch.com': 'MarketWatch',
  'msn.com': 'MSN',
  'news.google.com': 'Google News',
  'reuters.com': 'Reuters',
  'seekingalpha.com': 'Seeking Alpha',
  'thestreet.com': 'TheStreet',
  'wsj.com': 'The Wall Street Journal',
  'yahoo.com': 'Yahoo Finance',
  'zacks.com': 'Zacks',
};

function inferSourceFromUrl(link: string): string | null {
  try {
    const host = new URL(link).hostname.toLowerCase();
    const bare = host.startsWith('www.') ? host.slice(4) : host;

    if (SOURCE_BY_HOST[bare]) {
      return SOURCE_BY_HOST[bare];
    }
    for (const [domain, label] of Object.entries(SOURCE_BY_HOST)) {
      if (bare === domain || bare.endsWith(`.${domain}`)) {
        return label;
      }
    }

    const segments = bare.split('.').filter(Boolean);
    const label =
      segments.length >= 2 ? segments[segments.length - 2] : segments[0];
    if (!label || /^\d+$/.test(label)) {
      return bare;
    }
    return label.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return null;
  }
}

function stripHtmlToText(html: string): string {
  const noTags = html.replace(/<[^>]+>/g, ' ');
  return decodeXmlEntities(noTags).replace(/\s+/g, ' ').trim();
}

function truncateSnippet(text: string): string {
  if (text.length <= SNIPPET_MAX) {
    return text;
  }
  return `${text.slice(0, SNIPPET_MAX - 1).trim()}…`;
}

function companySearchTokens(companyName: string | null): string[] {
  if (!companyName) {
    return [];
  }
  return companyName
    .split(/[\s,.&'-]+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 4 && !COMPANY_NOISE.has(w));
}

function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .trim();
}

function parsePubDateMs(pubDate: string | null): number {
  if (!pubDate) {
    return 0;
  }
  const ms = Date.parse(pubDate);
  return Number.isNaN(ms) ? 0 : ms;
}

function isRelevantToStock(
  haystack: string,
  symbolUpper: string,
  tokens: string[]
): boolean {
  const h = haystack.toLowerCase();
  if (h.includes(symbolUpper.toLowerCase())) {
    return true;
  }
  return tokens.some((t) => h.includes(t));
}

function passesRelevance(
  c: ParsedCandidate,
  symbolUpper: string,
  tokens: string[]
): boolean {
  if (c.fromTickerScopedFeed) {
    return true;
  }
  const blob = `${c.title} ${c.link}`;
  return isRelevantToStock(blob, symbolUpper, tokens);
}

function parseRssItems(rss: string): string[] {
  return [...rss.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((m) => m[1])
    .filter((block): block is string => Boolean(block));
}

function itemToCandidate(
  itemXml: string,
  fromTickerScopedFeed: boolean
): ParsedCandidate | null {
  const rawTitle = extractTagContent(itemXml, 'title');
  const rawLink = extractTagContent(itemXml, 'link');
  const pubDate = extractTagContent(itemXml, 'pubDate');
  const rawDescription = extractTagContent(itemXml, 'description');

  if (!rawTitle || !rawLink) {
    return null;
  }

  const title = decodeXmlEntities(unwrapCdata(rawTitle)).trim();
  const link = decodeXmlEntities(unwrapCdata(rawLink)).trim();
  if (!title || !link) {
    return null;
  }

  const sourceFromTag = extractSourceTag(itemXml);
  const { cleanTitle, source: sourceFromTitle } = parseNewsSourceFromTitle(title);

  let displayTitle = title;
  const source: string | null = sourceFromTag ?? sourceFromTitle;
  if (sourceFromTag) {
    const lower = title.toLowerCase();
    const needle = ` - ${sourceFromTag.toLowerCase()}`;
    const idx = lower.lastIndexOf(needle);
    if (idx !== -1 && idx + needle.length === lower.length) {
      displayTitle = title.slice(0, idx).trim();
    }
  } else if (sourceFromTitle) {
    displayTitle = cleanTitle;
  }

  let snippet: string | null = null;
  if (rawDescription) {
    const text = stripHtmlToText(unwrapCdata(rawDescription));
    snippet = text ? truncateSnippet(text) : null;
  }

  const pubRaw = pubDate ? decodeXmlEntities(unwrapCdata(pubDate)).trim() : null;
  const publishedMs = parsePubDateMs(pubRaw);

  return {
    title: displayTitle || title,
    link,
    source,
    publishedAt: pubRaw,
    snippet,
    publishedMs,
    fromTickerScopedFeed,
  };
}

async function fetchRssText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 },
      headers: FETCH_HEADERS,
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

async function loadGoogleNewsCandidates(
  symbolUpper: string,
  stockName: string | null
): Promise<ParsedCandidate[]> {
  const query = encodeURIComponent(`${symbolUpper} stock ${stockName ?? ''}`.trim());
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
  const rss = await fetchRssText(url);
  if (!rss) {
    return [];
  }
  const blocks = parseRssItems(rss).slice(0, RAW_CAP_PER_FEED);
  return blocks.flatMap((xml) => {
    const c = itemToCandidate(xml, false);
    return c ? [c] : [];
  });
}

async function loadYahooHeadlineCandidates(symbolUpper: string): Promise<ParsedCandidate[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbolUpper)}&region=US&lang=en-US`;
  const rss = await fetchRssText(url);
  if (!rss) {
    return [];
  }
  const blocks = parseRssItems(rss).slice(0, RAW_CAP_PER_FEED);
  return blocks.flatMap((xml) => {
    const c = itemToCandidate(xml, true);
    return c ? [c] : [];
  });
}

function dedupeAndRank(candidates: ParsedCandidate[]): ParsedCandidate[] {
  const groups = new Map<string, ParsedCandidate[]>();
  for (const c of candidates) {
    const key = normalizeTitleKey(c.title);
    if (!key) {
      continue;
    }
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  const merged: ParsedCandidate[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => b.publishedMs - a.publishedMs);
    const primary = sorted[0]!;
    const sourceFromDup = sorted.find((x) => x.source)?.source ?? null;
    merged.push({
      ...primary,
      source: primary.source ?? sourceFromDup,
    });
  }

  return merged.sort((a, b) => b.publishedMs - a.publishedMs);
}

async function mergeStockNews(symbolUpper: string, stockName: string | null): Promise<StockNewsItem[]> {
  const [google, yahoo] = await Promise.all([
    loadGoogleNewsCandidates(symbolUpper, stockName),
    loadYahooHeadlineCandidates(symbolUpper),
  ]);

  const merged = [...google, ...yahoo];
  const tokens = companySearchTokens(stockName);
  const cutoff = Date.now() - MAX_ITEM_AGE_MS;

  const fresh = merged.filter((c) => c.publishedMs === 0 || c.publishedMs >= cutoff);

  let pool = fresh.filter((c) => passesRelevance(c, symbolUpper, tokens));
  if (pool.length === 0 && fresh.length > 0) {
    pool = fresh;
  }
  if (pool.length === 0 && merged.length > 0) {
    pool = merged;
  }

  const ranked = dedupeAndRank(pool);
  return ranked.slice(0, OUTPUT_LIMIT).map((c) => ({
    title: c.title,
    link: c.link,
    source: c.source ?? inferSourceFromUrl(c.link),
    publishedAt: c.publishedAt,
    snippet: c.snippet,
  }));
}

async function fetchStockNewsForCache(symbolUpper: string, stockName: string | null): Promise<StockNewsItem[]> {
  try {
    return await mergeStockNews(symbolUpper, stockName);
  } catch (error) {
    console.error('stock-news: merge failed', error);
    return [];
  }
}

/**
 * Cached per-symbol headline list (Google News + Yahoo Finance RSS), merged and deduped.
 */
export function getCachedStockNews(symbol: string, stockName: string | null): Promise<StockNewsItem[]> {
  const sym = symbol.toUpperCase();
  const nameKey = (stockName ?? '').trim().toLowerCase();

  return unstable_cache(
    () => fetchStockNewsForCache(sym, stockName),
    ['stock-detail-news', STOCK_NEWS_SOURCES_VERSION, sym, nameKey],
    { revalidate: 3600 }
  )();
}
