const malaysiaDate = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Kuala_Lumpur',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const dateFields = {
  jobs: 'service_date',
  quotes: 'valid_until',
  invoices: 'due_date',
  expenses: 'expense_date',
};

export function businessDate(now = new Date()) {
  const parts = Object.fromEntries(malaysiaDate.formatToParts(now).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function parseDate(value) {
  const date = new Date(value + 'T00:00:00Z');
  if (typeof value !== 'string' || value.startsWith('0000-') || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) || isoDate(date) !== value) {
    throw new Error('Expected a valid YYYY-MM-DD business date');
  }
  return date;
}

export function expandDate(value, day) {
  const date = parseDate(day);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isoDate(parseDate(value));
  const token = typeof value === 'string' && /^(today|month-start|month-end)([+-]\d+)?$/.exec(value);
  if (!token) throw new Error('Invalid seed date token');
  if (token[1] === 'month-start') date.setUTCDate(1);
  if (token[1] === 'month-end') date.setUTCMonth(date.getUTCMonth() + 1, 0);
  date.setUTCDate(date.getUTCDate() + Number(token[2] ?? 0));
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error('Seed date is out of range');
  }
  return isoDate(date);
}

export function relativeDate(value, day) {
  const offset = (parseDate(value) - parseDate(day)) / 86400000;
  return offset === 0 ? 'today' : 'today' + (offset > 0 ? '+' : '') + offset;
}
