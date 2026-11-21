import { readFile } from 'node:fs/promises';
import { checkAuth, isMain, readConfig, supabaseRequest } from './demo-seed/supabase.mjs';
import { businessDate } from './demo-seed/shiftDates.mjs';
import { businessTables, expandSeed } from './demo-seed/seed.mjs';

const seedFile = new URL('./demo-seed/data.json', import.meta.url);
const buckets = [
  'signed-documents', 'owner-signatures', 'expense-receipts', 'job-photos',
  'job-po-documents', 'customer-returned-documents', 'document-archives', 'reference-documents',
];
const pageSize = 100;

async function listObjects(request, bucket) {
  const folders = [''];
  const paths = new Set();
  const seen = new Set();
  for (const prefix of folders) {
    for (let offset = 0; ; ) {
      const page = await request('Storage listing for ' + bucket, '/storage/v1/object/list/' + bucket, 'POST', {
        prefix, limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' },
      });
      if (!Array.isArray(page)) throw new Error('Unexpected Storage listing for ' + bucket);
      for (const entry of page) {
        if (typeof entry?.name !== 'string' || !entry.name || (entry.id !== null && typeof entry.id !== 'string')) {
          throw new Error('Unexpected Storage entry for ' + bucket);
        }
        const path = prefix ? prefix + '/' + entry.name : entry.name;
        const key = (entry.id === null ? 'folder:' : 'file:') + path;
        if (seen.has(key)) throw new Error('Repeated Storage entry for ' + bucket);
        seen.add(key);
        if (entry.id === null) folders.push(path);
        else paths.add(path);
      }
      if (page.length < pageSize) break;
      offset += page.length;
    }
  }
  return [...paths];
}

async function clearStorage(request) {
  const counts = {};
  for (const bucket of buckets) {
    // Collect all pages before deleting so offsets never skip objects.
    const paths = await listObjects(request, bucket);
    for (let start = 0; start < paths.length; start += pageSize) {
      await request('Storage deletion for ' + bucket, '/storage/v1/object/' + bucket, 'DELETE', {
        prefixes: paths.slice(start, start + pageSize),
      });
    }
    if (paths.length && (await listObjects(request, bucket)).length) {
      throw new Error('Storage objects remain in ' + bucket);
    }
    counts[bucket] = paths.length;
  }
  return counts;
}

export async function resetDemo({ env = process.env, fetcher = fetch, now = new Date(), seed } = {}) {
  const config = readConfig(env);
  const request = supabaseRequest(config, fetcher);
  await checkAuth(request, config.allowedEmails);

  const day = businessDate(now);
  if (seed === undefined) {
    try {
      seed = JSON.parse(await readFile(seedFile, 'utf8'));
    } catch {
      throw new Error('Cannot read the golden seed JSON');
    }
  }
  const expanded = expandSeed(seed, day);
  const expectedCounts = Object.fromEntries(Object.keys(businessTables).map(key => [key, expanded[key].length]));
  const result = await request('Database reset', '/rest/v1/rpc/reset_demo_data', 'POST', {
    p_allowed_emails: config.allowedEmails,
    p_seed: expanded,
    p_business_date: day,
    p_source: env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'manual',
  });
  if (result?.result !== 'success' || result.business_date !== day ||
      Object.entries(expectedCounts).some(([key, count]) => result.counts?.[key] !== count)) {
    throw new Error('Database reset response did not match the seed. Check the database audit before retrying');
  }

  let storageDeleted;
  try {
    storageDeleted = await clearStorage(request);
  } catch (error) {
    throw new Error(`Database reset committed for ${day}; Storage cleanup failed. ${error.message}`);
  }
  return { result: 'success', business_date: day, counts: expectedCounts, storage_deleted: storageDeleted };
}

if (isMain(import.meta.url)) {
  try {
    console.log(JSON.stringify(await resetDemo()));
  } catch (error) {
    console.error('Demo reset failed:', error.message);
    process.exitCode = 1;
  }
}
