import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { exportSeed } from '../export-demo-seed.mjs';
import { resetDemo } from '../reset-demo-data.mjs';
import { businessTables, expandSeed } from './seed.mjs';
import { businessDate, expandDate, relativeDate } from './shiftDates.mjs';
import { assertAuthEmails, parseAllowedEmails, readConfig } from './supabase.mjs';

const env = {
  DEMO_SUPABASE_URL: 'https://abc123.supabase.co',
  DEMO_ALLOWED_PROJECT_REF: 'abc123',
  DEMO_SUPABASE_SERVICE_ROLE_KEY: 'mock-credential',
  DEMO_ALLOWED_USER_EMAILS: 'demo@gmail.com',
};
const seed = JSON.parse(await readFile(new URL('./test-fixtures/sample-seed.json', import.meta.url), 'utf8'));
const demo = { id: 'demo-id', email: 'demo@gmail.com' };
const day = '2026-11-20';
const now = new Date(day + 'T01:00:00Z');
const json = value => Response.json(value);
const counts = Object.fromEntries(Object.keys(businessTables).map(key => [key, seed[key].length]));

test('Malaysia date changes at 16:00 UTC across a month boundary', () => {
  assert.equal(businessDate(new Date('2024-02-29T15:59:59Z')), '2024-02-29');
  assert.equal(businessDate(new Date('2024-02-29T16:00:00Z')), '2024-03-01');
  assert.equal(expandDate('month-end', '2024-02-01'), '2024-02-29');
  assert.equal(expandDate('month-end+1', '2024-02-03'), '2024-03-01');
  assert.equal(expandDate('month-start+2', '2024-03-01'), '2024-03-03');
  assert.equal(expandDate('today-5', '2024-03-01'), '2024-02-25');
  assert.equal(expandDate('today+3', '2024-12-31'), '2025-01-03');
  assert.throws(() => expandDate('2024-02-30', day), /valid YYYY-MM-DD/);
  assert.throws(() => expandDate('tomorrow', day), /Invalid seed date/);
  for (const date of ['2024-02-29', '2024-03-01', '2024-03-03']) {
    assert.equal(expandDate(relativeDate(date, '2024-03-01'), '2024-03-01'), date);
  }
});

test('expands fixture fields without mutating the original seed', () => {
  const result = expandSeed(seed, day);
  assert.deepEqual(result.jobs.map(row => row.service_date), [day, '2026-11-01']);
  assert.deepEqual(result.invoices.map(row => row.due_date), ['2026-11-23', '2026-11-15']);
  assert.equal(result.quotes[0].valid_until, '2026-11-30');
  assert.equal(result.expenses[0].expense_date, '2026-11-03');
  assert.equal(seed.jobs[0].service_date, 'today');
});

test('validates the exact HTTPS project origin', () => {
  assert.equal(readConfig(env).origin, env.DEMO_SUPABASE_URL);
  assert.equal(readConfig({ ...env, DEMO_SUPABASE_URL: 'https://ABC123.SUPABASE.CO/' }).origin, env.DEMO_SUPABASE_URL);
  for (const url of [
    'http://abc123.supabase.co', 'https://abc123.example.test', 'https://user@abc123.supabase.co',
    'https://different.supabase.co', 'https://abc123.supabase.co:443', 'https://abc123.supabase.co/example',
    'https://abc123.supabase.co/?', 'https://abc123.supabase.co/#', 'https://abc123.supabase.co.evil.test',
  ]) {
    assert.throws(() => readConfig({ ...env, DEMO_SUPABASE_URL: url }), /allowed HTTPS project origin/);
  }
  assert.throws(() => readConfig({ ...env, DEMO_ALLOWED_PROJECT_REF: 'other' }), /allowed HTTPS project origin/);
  for (const key of Object.keys(env)) assert.throws(() => readConfig({ ...env, [key]: undefined }));
});

test('normalizes, deduplicates and requires known Auth emails including the demo account', () => {
  const emails = parseAllowedEmails(' DEMO@gmail.com , , demo@gmail.COM, extra@example.test  ');
  assert.deepEqual(emails, ['demo@gmail.com', 'extra@example.test']);
  assert.doesNotThrow(() => assertAuthEmails([{ email: ' demo@GMAIL.com\t' }], emails));
  assert.throws(() => parseAllowedEmails(' , '), /at least one/);
  for (const email of ['unlisted@example.test', null, ' \t ', undefined]) {
    assert.throws(() => assertAuthEmails([demo, { email }], emails), /missing or unlisted/);
  }
  assert.throws(() => assertAuthEmails([{ email: 'extra@example.test' }], emails), /demo Auth account is missing/);
});

test('project mismatch stops both scripts before any HTTP request', async () => {
  let calls = 0;
  const fetcher = () => { calls++; };
  const options = { env: { ...env, DEMO_ALLOWED_PROJECT_REF: 'other' }, fetcher };
  await assert.rejects(resetDemo(options), /allowed HTTPS project origin/);
  await assert.rejects(exportSeed(options), /allowed HTTPS project origin/);
  assert.equal(calls, 0);
});

test('unlisted Auth user on a later page blocks RPC and Storage', async () => {
  const calls = [];
  const fetcher = (url, options) => {
    const path = new URL(url);
    calls.push([path.pathname, options.method]);
    const page = path.searchParams.get('page');
    return json({ users: page === '1' ? [demo] : page === '2' ? [{ id: 'other-id', email: 'other@example.test' }] : [] });
  };
  await assert.rejects(resetDemo({ env, fetcher, seed }), /missing or unlisted/);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => ['/auth/v1/admin/users', 'GET']));
});

test('runner reseeds first, then paginates folders and deletes all objects in batches', async () => {
  const expected = Array.from({ length: 101 }, (_, i) => 'nested/file-' + i);
  const deleted = [];
  const listedBuckets = new Set();
  let committed = false;
  const fetcher = (url, { method, body, headers, redirect }) => {
    const path = new URL(url);
    assert.equal(redirect, 'error');
    assert.equal(headers.apikey, env.DEMO_SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(headers.Authorization, 'Bearer ' + env.DEMO_SUPABASE_SERVICE_ROLE_KEY);
    if (path.pathname.startsWith('/auth/')) return json({ users: path.searchParams.get('page') === '1' ? [demo] : [] });
    if (path.pathname === '/rest/v1/rpc/reset_demo_data') {
      assert.equal(method, 'POST');
      const payload = JSON.parse(body);
      assert.equal(payload.p_business_date, day);
      assert.deepEqual(payload.p_seed, expandSeed(seed, day));
      committed = true;
      return json({ business_date: day, counts, result: 'success' });
    }
    assert.equal(committed, true);
    const bucket = path.pathname.split('/').at(-1);
    if (method === 'DELETE') {
      assert.equal(bucket, 'job-photos');
      assert.ok(JSON.parse(body).prefixes.length <= 100);
      deleted.push(...JSON.parse(body).prefixes);
      return json([]);
    }
    assert.equal(method, 'POST');
    listedBuckets.add(bucket);
    if (bucket !== 'job-photos' || deleted.length === expected.length) return json([]);
    const { prefix, offset, limit } = JSON.parse(body);
    if (!prefix) return json([{ name: 'nested', id: null }]);
    assert.equal(prefix, 'nested');
    return json(expected.slice(offset, offset + limit).map(name => ({ name: name.slice(7), id: name })));
  };
  const summary = await resetDemo({ env, fetcher, now, seed });
  assert.deepEqual(deleted, expected);
  assert.equal(listedBuckets.size, 8);
  assert.equal(summary.storage_deleted['job-photos'], 101);
});

test('failed RPC avoids Storage and a later Storage failure reports the committed reset', async () => {
  for (const rpcOk of [false, true]) {
    let storageCalls = 0;
    const fetcher = url => {
      const path = new URL(url);
      if (path.pathname.startsWith('/auth/')) return json({ users: path.searchParams.get('page') === '1' ? [demo] : [] });
      if (path.pathname.startsWith('/rest/')) {
        return rpcOk ? json({ business_date: day, counts, result: 'success' }) : new Response('private error body', { status: 400 });
      }
      storageCalls++;
      return new Response('private error body', { status: 503 });
    };
    await assert.rejects(resetDemo({ env, fetcher, now, seed }), error => {
      assert.match(error.message, rpcOk ? /committed.*Storage cleanup failed/ : /Database reset failed \(HTTP 400\)/);
      assert.doesNotMatch(error.message, /private error body/);
      return true;
    });
    assert.equal(storageCalls, rpcOk ? 1 : 0);
  }
});

test('export uses GET exclusively, checks profiles and round-trips business dates', async () => {
  const concrete = expandSeed(seed, day);
  for (const email of ['demo@gmail.com', 'other@example.test']) {
    const fetcher = (url, { method, body }) => {
      const path = new URL(url);
      assert.equal(method, 'GET');
      assert.equal(body, undefined);
      if (path.pathname.startsWith('/auth/')) return json({ users: path.searchParams.get('page') === '1' ? [demo] : [] });
      assert.ok(path.pathname.startsWith('/rest/v1/'));
      if (path.searchParams.get('offset') !== '0') return json([]);
      const table = path.pathname.split('/').at(-1);
      if (table === 'user_profiles') return json([{ email, employee_id: seed.employees[0].id }]);
      const key = Object.keys(businessTables).find(name => businessTables[name][0] === table);
      assert.ok(key);
      assert.equal(path.searchParams.get('select'), businessTables[key][1]);
      return json(concrete[key]);
    };
    if (email !== demo.email) {
      await assert.rejects(exportSeed({ env, fetcher, day }), /unlisted profile email/);
      continue;
    }
    const result = await exportSeed({ env, fetcher, day });
    const expanded = expandSeed(result.seed, day);
    for (const key of Object.keys(businessTables)) assert.deepEqual(expanded[key], concrete[key]);
    assert.equal(expanded.userProfileLinks[demo.email], seed.employees[0].id);
    assert.equal(result.distinctEmails, 1);
    assert.equal(result.distinctPhones, 2);
  }
});
