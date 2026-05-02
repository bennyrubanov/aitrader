import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiAnalysisRunScoreRow } from '@/lib/portfolio-config-compute-core';
import { fetchAiAnalysisRunsForBatches } from '@/lib/portfolio-config-compute-core';

function row(i: number): AiAnalysisRunScoreRow {
  return {
    batch_id: 'batch-1',
    stock_id: `stock-${i}`,
    score: 1,
    latent_rank: 50,
    bucket: null,
    stocks: { symbol: 'MU', company_name: null },
  };
}

test('fetchAiAnalysisRunsForBatches requests multiple pages when >1000 rows', async () => {
  const ranges: Array<{ from: number; to: number }> = [];
  const chain = {
    select() {
      return this;
    },
    in() {
      return this;
    },
    order() {
      return this;
    },
    range(from: number, to: number) {
      ranges.push({ from, to });
      const pageIndex = ranges.length - 1;
      if (pageIndex === 0) {
        return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => row(i)), error: null });
      }
      return Promise.resolve({ data: Array.from({ length: 111 }, (_, i) => row(1000 + i)), error: null });
    },
  };
  const supabase = { from: () => chain } as Parameters<typeof fetchAiAnalysisRunsForBatches>[0];

  const out = await fetchAiAnalysisRunsForBatches(supabase, ['batch-1']);

  assert.equal(out.length, 1111);
  assert.deepEqual(ranges, [
    { from: 0, to: 999 },
    { from: 1000, to: 1999 },
  ]);
});

test('fetchAiAnalysisRunsForBatches returns empty for empty batchIds', async () => {
  const supabase = {
    from: () => {
      throw new Error('from() must not be called');
    },
  } as unknown as Parameters<typeof fetchAiAnalysisRunsForBatches>[0];
  const out = await fetchAiAnalysisRunsForBatches(supabase, []);
  assert.deepEqual(out, []);
});
