import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { checkAuth, isMain, normalizeEmail, readConfig, supabaseRequest } from './demo-seed/supabase.mjs';
import { businessTables } from './demo-seed/seed.mjs';
import { businessDate, dateFields, parseDate, relativeDate } from './demo-seed/shiftDates.mjs';

async function readRows(get, table, columns) {
  const rows = [];
  for (;;) {
    const query = new URLSearchParams({ select: columns, order: 'id.asc', limit: '100', offset: String(rows.length) });
    const page = await get('Export read for ' + table, '/rest/v1/' + table + '?' + query);
    if (!Array.isArray(page)) throw new Error('Unexpected export response for ' + table);
    if (!page.length) return rows;
    rows.push(...page);
  }
}

export async function exportSeed({ env = process.env, fetcher = fetch, day = businessDate() } = {}) {
  const config = readConfig(env);
  parseDate(day);
  const request = supabaseRequest(config, fetcher);
  // The export's HTTP interface only exposes GET.
  const get = (operation, path) => request(operation, path, 'GET');
  await checkAuth(get, config.allowedEmails);

  const profiles = await readRows(get, 'user_profiles', 'email,employee_id');
  const userProfileLinks = Object.create(null);
  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!config.allowedEmails.includes(email)) {
      throw new Error('导出已停止：用户资料中有空白或未获准电邮。 Export blocked by a missing or unlisted profile email.');
    }
    if (profile.employee_id) userProfileLinks[email] = profile.employee_id;
  }

  const seed = { version: 1, _meta: 'Fictional demo export. Business dates use relative tokens.' };
  const counts = { user_profiles: profiles.length };
  for (const [key, [table, columns]] of Object.entries(businessTables)) {
    const rows = await readRows(get, table, columns);
    const field = dateFields[key];
    seed[key] = field ? rows.map(row => ({ ...row, [field]: relativeDate(row[field], day) })) : rows;
    counts[key] = rows.length;
  }
  seed.userProfileLinks = userProfileLinks;

  const emails = new Set([...profiles, ...seed.customers].map(row => normalizeEmail(row.email)).filter(Boolean));
  const phones = new Set([...seed.customers, ...seed.employees].map(row => row.phone?.trim()).filter(Boolean));
  return {
    seed,
    counts: { ...counts, userProfileLinks: Object.keys(userProfileLinks).length },
    distinctEmails: emails.size,
    distinctPhones: phones.size,
  };
}

if (isMain(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        'read-only-export': { type: 'boolean' },
        output: { type: 'string' },
        'business-date': { type: 'string' },
      },
    });
    if (!values['read-only-export'] || !values.output) {
      throw new Error('Usage: node scripts/export-demo-seed.mjs --read-only-export --output <new-file> [--business-date YYYY-MM-DD]');
    }
    const exported = await exportSeed({ day: values['business-date'] });
    await writeFile(values.output, JSON.stringify(exported.seed, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('审核清单 / Review checklist');
    console.log('各表笔数 / Row counts', JSON.stringify(exported.counts));
    console.log('不同电邮数 / Distinct emails', exported.distinctEmails);
    console.log('不同电话号码数 / Distinct phone numbers', exported.distinctPhones);
    console.log('请检查 JSON，确认没有真实个人资料，再考虑提交。');
    console.log('Review the JSON for real personal data before any commit.');
  } catch (error) {
    // parseArgs and filesystem errors can contain CLI input or local paths.
    const message = error.code ? 'Check the export arguments and choose a new, writable output file.' : error.message;
    console.error('导出失败 / Export failed:', message);
    process.exitCode = 1;
  }
}
