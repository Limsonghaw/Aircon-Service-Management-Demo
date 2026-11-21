import { pathToFileURL } from 'node:url';

export const demoEmail = 'demo@gmail.com';
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function parseAllowedEmails(value) {
  const emails = [...new Set((value ?? '').split(',').map(normalizeEmail).filter(Boolean))];
  if (!emails.length) throw new Error('DEMO_ALLOWED_USER_EMAILS must contain at least one email');
  return emails;
}

export function readConfig(env) {
  const ref = env.DEMO_ALLOWED_PROJECT_REF?.trim().toLowerCase();
  const url = env.DEMO_SUPABASE_URL?.trim().toLowerCase();
  const key = env.DEMO_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!ref || !url || !key) throw new Error('Required Supabase configuration is missing');
  const origin = `https://${ref}.supabase.co`;
  if (!/^[a-z0-9]+$/.test(ref) || (url !== origin && url !== origin + '/')) {
    throw new Error('Supabase URL must match the allowed HTTPS project origin');
  }
  return { origin, key, allowedEmails: parseAllowedEmails(env.DEMO_ALLOWED_USER_EMAILS) };
}

export function assertAuthEmails(users, allowedEmails) {
  const emails = users.map(user => normalizeEmail(user.email));
  if (emails.some(email => !email || !allowedEmails.includes(email))) {
    throw new Error('Auth check blocked the operation because an email is missing or unlisted');
  }
  if (!emails.includes(demoEmail)) throw new Error('The demo Auth account is missing');
}

export function supabaseRequest(config, fetcher) {
  return async function request(operation, path, method = 'GET', payload) {
    let response;
    try {
      response = await fetcher(config.origin + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
        headers: {
          apikey: config.key,
          Authorization: 'Bearer ' + config.key,
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
    } catch {
      throw new Error(operation + ' request failed');
    }
    if (!response.ok) throw new Error(operation + ' failed (HTTP ' + response.status + ')');
    try {
      return await response.json();
    } catch {
      throw new Error(operation + ' returned invalid JSON');
    }
  };
}

export async function checkAuth(request, allowedEmails) {
  const users = [];
  const seen = new Set();
  for (let page = 1; ; page++) {
    const result = await request('Auth listing', '/auth/v1/admin/users?per_page=100&page=' + page);
    if (!Array.isArray(result?.users)) throw new Error('Auth listing returned an unexpected response');
    if (result.users.length === 0) break;
    for (const user of result.users) {
      if (typeof user?.id !== 'string' || seen.has(user.id)) {
        throw new Error('Auth listing returned an invalid or repeated user');
      }
      seen.add(user.id);
      users.push(user);
    }
  }
  assertAuthEmails(users, allowedEmails);
}

export function isMain(url) {
  return Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === url);
}
