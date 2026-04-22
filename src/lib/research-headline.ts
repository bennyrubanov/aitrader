import { createHash } from 'crypto';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { computeResearchStats, type ResearchStats } from '@/lib/quintile-analysis';

export const RESEARCH_HEADLINE_MODEL = 'gpt-5-mini' as const;

const ResearchHeadlineSchema = z
  .object({
    headline: z.string().min(10).max(160),
    body: z.string().min(40).max(700),
  })
  .strict();

export type ResearchHeadlineParsed = z.infer<typeof ResearchHeadlineSchema>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isString = (v: unknown): v is string => typeof v === 'string';

const extractStructuredOutput = (payload: unknown) => {
  if (isRecord(payload)) {
    const status = payload.status;
    const incomplete = payload.incomplete_details;
    if (status === 'incomplete' && isRecord(incomplete) && isString(incomplete.reason)) {
      throw new Error(`OpenAI response incomplete: ${incomplete.reason}`);
    }
  }

  if (isRecord(payload) && isString(payload.output_text)) {
    return { text: payload.output_text.trim(), refusal: null as string | null };
  }

  const output = isRecord(payload) ? payload.output : null;
  if (!Array.isArray(output)) {
    return { text: '', refusal: null as string | null };
  }

  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }
    for (const contentItem of item.content) {
      if (!isRecord(contentItem) || !isString(contentItem.type)) {
        continue;
      }
      if (contentItem.type === 'refusal' && isString(contentItem.refusal)) {
        return { text: '', refusal: contentItem.refusal };
      }
      if (contentItem.type === 'output_text' && isString(contentItem.text)) {
        chunks.push(contentItem.text);
      }
    }
  }

  return { text: chunks.join('\n').trim(), refusal: null as string | null };
};

const parseStructuredOutput = <T>(outputText: string): T => {
  const trimmed = outputText.trim();
  if (!trimmed) {
    throw new Error('OpenAI response missing output_text');
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const sliced = trimmed.slice(start, end + 1);
      return JSON.parse(sliced) as T;
    }
    const message = error instanceof Error ? error.message : 'unknown parse error';
    throw new Error(`Failed to parse JSON output: ${message}`);
  }
};

const fmt = (n: number | null, digits: number) =>
  n == null || !Number.isFinite(n) ? 'n/a' : n.toFixed(digits);

/** Build system + user messages and a sha256 of both for auditing. */
export function buildResearchHeadlinePrompt(
  stats: ResearchStats,
  previousHeadline: string | null
): { system: string; user: string; promptHash: string } {
  const betaPosCount =
    stats.betaPositiveRate != null && stats.weeks > 0
      ? Math.round(stats.betaPositiveRate * stats.weeks)
      : null;

  const system = `You are a quantitative research analyst summarizing the latest weekly
cross-sectional regression diagnostics for an AI stock-ranking model against
the Nasdaq-100 universe (~100 stocks/week). Return ONLY JSON matching the
schema. Tone: plainspoken, data-driven, no hype. Be honest about sample size.`;

  const user = `Stats across ${stats.weeks} weekly runs (latent rank → 1-week forward return, OLS):
- mean β: ${fmt(stats.meanBeta, 6)} (t-stat ${fmt(stats.tMeanBeta, 3)})
- β positive rate: ${fmt(stats.betaPositiveRate, 3)} (${betaPosCount ?? 'n/a'} of ${stats.weeks} weeks)
- sd β: ${fmt(stats.sdBeta, 6)}, |β| mean: ${fmt(stats.meanAbsBeta, 6)}, range [${fmt(stats.minBeta, 6)}, ${fmt(stats.maxBeta, 6)}]
- mean R²: ${fmt(stats.meanRsq, 4)}, range [${fmt(stats.minRsq, 4)}, ${fmt(stats.maxRsq, 4)}]
- mean α: ${fmt(stats.meanAlpha, 6)} (t-stat ${fmt(stats.tMeanAlpha, 3)}, α+ rate ${fmt(stats.alphaPositiveRate, 3)})
- mean n per week: ${fmt(stats.meanSampleSize, 1)}

Rules of thumb to apply:
- β positive rate in [0.40, 0.60] with t<2 → "no directional edge yet"
- |β|/|mean β| > 20 → "model sorts by magnitude/conviction, not direction"
- R² ≥ 0.03 → model explains real variance in magnitude
- t on mean β: |t|<1 indistinguishable from zero; |t|≥2 real edge
- <25 weeks → caveat that sample is too small for a verdict

Previous week's headline (for continuity, may be null):
"${previousHeadline ?? ''}"

Task:
1) headline: one short sentence capturing the current state of signal trustworthiness.
   Prefer directional language ("still no directional edge", "first signs of a
   positive edge", "edge is deteriorating"). If continuation from previous headline,
   reflect that.
2) body: 2–3 complete sentences (target 350–600 characters) expanding the headline,
   citing the 1–2 most important numbers and naming the weekly sample size.
   Always finish your last sentence. Never claim significance below |t|=2.
   Never recommend trading actions.`;

  const combined = `${system}\n\n${user}`;
  const promptHash = createHash('sha256').update(combined, 'utf8').digest('hex');
  return { system, user, promptHash };
}

export async function generateResearchHeadline(
  stats: ResearchStats,
  previousHeadline: string | null
): Promise<{ headline: string; body: string; promptHash: string; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  const { system, user, promptHash } = buildResearchHeadlinePrompt(stats, previousHeadline);
  const client = new OpenAI({ apiKey });

  const payload = await client.responses.parse({
    model: RESEARCH_HEADLINE_MODEL,
    max_output_tokens: 4000,
    input: [
      {
        role: 'system',
        content: system.replace(/\s+/g, ' ').trim(),
      },
      { role: 'user', content: user },
    ],
    text: {
      format: zodTextFormat(ResearchHeadlineSchema, 'research_headline'),
    },
  } as unknown as Parameters<typeof client.responses.parse>[0]);

  const { text: outputText, refusal } = extractStructuredOutput(payload);
  if (refusal) {
    throw new Error(`OpenAI refusal: ${refusal}`);
  }

  const parsed =
    (payload as { output_parsed?: ResearchHeadlineParsed }).output_parsed ??
    parseStructuredOutput<ResearchHeadlineParsed>(outputText);

  const safe = ResearchHeadlineSchema.parse(parsed);
  return {
    headline: safe.headline,
    body: safe.body,
    promptHash,
    model: RESEARCH_HEADLINE_MODEL,
  };
}

/**
 * Load weekly regression history, compute stats, call OpenAI, upsert one row for the latest week.
 * Used by cron (rebalance day) and one-off backfill scripts.
 */
export async function upsertWeeklyResearchHeadlineForStrategy(
  supabase: SupabaseClient,
  strategyId: string
): Promise<'skipped' | 'upserted'> {
  const { data: regHistRows, error: regHistErr } = await supabase
    .from('strategy_cross_sectional_regressions')
    .select('run_date, sample_size, alpha, beta, r_squared')
    .eq('strategy_id', strategyId)
    .eq('horizon_weeks', 1)
    .order('run_date', { ascending: false })
    .limit(200);

  if (regHistErr) {
    throw new Error(regHistErr.message);
  }

  const regHistMapped = (regHistRows ?? []).map((r) => {
    const alpha = r.alpha == null ? null : Number(r.alpha);
    const beta = r.beta == null ? null : Number(r.beta);
    const rSquared = r.r_squared == null ? null : Number(r.r_squared);
    const sampleSize = r.sample_size == null ? null : Number(r.sample_size);
    return {
      runDate: String(r.run_date),
      alpha: Number.isFinite(alpha as number) ? (alpha as number) : null,
      beta: Number.isFinite(beta as number) ? (beta as number) : null,
      rSquared: Number.isFinite(rSquared as number) ? (rSquared as number) : null,
      sampleSize:
        sampleSize != null && Number.isFinite(sampleSize) && sampleSize > 0 ? sampleSize : null,
    };
  });

  const betaWeeks = regHistMapped.filter((r) => r.beta != null).length;
  if (betaWeeks < 2) {
    return 'skipped';
  }

  const stats = computeResearchStats(regHistMapped);
  const anchorRunDate = regHistMapped[0]?.runDate;
  if (!anchorRunDate) {
    throw new Error('Missing anchor run_date for research headline');
  }

  const { data: prevHeadRows, error: prevHeadErr } = await supabase
    .from('strategy_research_headlines')
    .select('headline')
    .eq('strategy_id', strategyId)
    .lt('run_date', anchorRunDate)
    .order('run_date', { ascending: false })
    .limit(1);

  if (prevHeadErr) {
    throw new Error(prevHeadErr.message);
  }

  const previousHeadline = prevHeadRows?.[0]?.headline ?? null;
  const { headline, body, promptHash, model } = await generateResearchHeadline(stats, previousHeadline);

  const { error: headlineUpsertErr } = await supabase.from('strategy_research_headlines').upsert(
    {
      strategy_id: strategyId,
      run_date: anchorRunDate,
      stats_json: stats,
      headline,
      body,
      previous_headline: previousHeadline,
      model,
      prompt_hash: promptHash,
    },
    { onConflict: 'strategy_id,run_date' }
  );

  if (headlineUpsertErr) {
    throw new Error(headlineUpsertErr.message);
  }

  return 'upserted';
}
