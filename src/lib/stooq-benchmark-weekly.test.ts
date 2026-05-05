import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeSimpleReturn,
  fetchBenchmarkReturnDetail,
  fetchStooqRowsWithMeta,
  getCloseOnOrBefore,
} from '@/lib/stooq-benchmark-weekly';

test('fetchStooqRowsWithMeta: bounded URL includes Stooq d1 and d2 (YYYYMMDD)', async (t) => {
  const orig = global.fetch;
  t.after(() => {
    global.fetch = orig;
  });
  let seenUrl = '';
  global.fetch = async (input: RequestInfo | URL) => {
    seenUrl = String(input);
    const csv =
      'Date,Open,High,Low,Close,Volume\r\n' +
      '2026-04-27,1,1,1,10000,0\r\n' +
      '2026-05-04,1,1,1,10100,0\r\n';
    return new Response(csv, { status: 200 });
  };
  process.env.STOOQ_API_KEY = 'test-stooq-key';
  try {
    const r = await fetchStooqRowsWithMeta('^ndx', { d1Iso: '2026-04-01', d2Iso: '2026-05-04' });
    assert.match(seenUrl, /[?&]d1=20260401\b/);
    assert.match(seenUrl, /[?&]d2=20260504\b/);
    assert.equal(r.ok, true);
    assert.equal(r.rowCount, 2);
    assert.equal(r.lastDate, '2026-05-04');
  } finally {
    delete process.env.STOOQ_API_KEY;
  }
});

test('fetchStooqRowsWithMeta: parses CRLF Stooq CSV', async (t) => {
  const orig = global.fetch;
  t.after(() => {
    global.fetch = orig;
  });
  global.fetch = async () =>
    new Response('Date,Open,High,Low,Close,Volume\r\n2026-01-02,10,10,10,99.5,1\r\n', {
      status: 200,
    });
  process.env.STOOQ_API_KEY = 'k';
  try {
    const r = await fetchStooqRowsWithMeta('qqew.us', { d1Iso: '2026-01-01', d2Iso: '2026-01-10' });
    assert.equal(r.ok, true);
    assert.equal(r.rows?.length, 1);
    assert.equal(r.rows?.[0]?.close, 99.5);
  } finally {
    delete process.env.STOOQ_API_KEY;
  }
});

test('fetchStooqRowsWithMeta: unbounded URL has no d1/d2 query params', async (t) => {
  const orig = global.fetch;
  t.after(() => {
    global.fetch = orig;
  });
  let seenUrl = '';
  global.fetch = async (input: RequestInfo | URL) => {
    seenUrl = String(input);
    return new Response('Date,Open,High,Low,Close,Volume\n2026-05-01,1,1,1,1,0\n', { status: 200 });
  };
  process.env.STOOQ_API_KEY = 'k';
  try {
    await fetchStooqRowsWithMeta('^spx');
    assert.doesNotMatch(seenUrl, /[?&]d1=/);
    assert.doesNotMatch(seenUrl, /[?&]d2=/);
  } finally {
    delete process.env.STOOQ_API_KEY;
  }
});

test('fetchBenchmarkReturnDetail: weekly return from bounded Stooq CSV', async (t) => {
  const orig = global.fetch;
  t.after(() => {
    global.fetch = orig;
  });
  global.fetch = async (input: RequestInfo | URL) => {
    const u = String(input);
    assert.ok(u.includes('d1='), 'expected bounded Stooq request');
    const csv =
      'Date,Open,High,Low,Close,Volume\r\n' +
      '2026-04-25,1,1,1,1000,0\r\n' +
      '2026-05-02,1,1,1,1100,0\r\n';
    return new Response(csv, { status: 200 });
  };
  process.env.STOOQ_API_KEY = 'k';
  try {
    const d = await fetchBenchmarkReturnDetail('^ndx', '2026-04-27', '2026-05-04');
    assert.equal(d.fetch.ok, true);
    assert.ok(Math.abs(d.returnValue - 0.1) < 1e-9);
    assert.equal(d.fromBarDate, '2026-04-25');
    assert.equal(d.toBarDate, '2026-05-02');
  } finally {
    delete process.env.STOOQ_API_KEY;
  }
});

test('getCloseOnOrBefore and computeSimpleReturn', () => {
  const rows = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-03', close: 110 },
  ];
  assert.deepEqual(getCloseOnOrBefore(rows, '2026-01-02'), { close: 100, barDate: '2026-01-01' });
  assert.equal(computeSimpleReturn(100, 110), 0.1);
  assert.equal(computeSimpleReturn(null, 1), 0);
});
