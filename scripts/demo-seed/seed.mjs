import { dateFields, expandDate } from './shiftDates.mjs';

const timestamps = 'created_at,updated_at';
export const businessTables = {
  teams: ['teams', 'id,name,notes,is_active,' + timestamps],
  employees: ['employees', 'id,team_id,name,phone,role,notes,is_active,' + timestamps],
  customers: ['customers', 'id,name,customer_type,phone,email,address,notes,' + timestamps],
  quotes: ['quotes', 'id,quote_number,customer_id,valid_until,status,notes,' + timestamps],
  quoteItems: ['quote_items', 'id,quote_id,position,description,quantity,unit_price'],
  jobs: ['jobs', 'id,job_number,customer_id,title,service_date,team,status,source_quote_id,' + timestamps],
  invoices: ['invoices', 'id,invoice_number,customer_id,amount,due_date,status,notes,source_quote_id,items,discount,' + timestamps],
  expenses: ['expenses', 'id,expense_number,description,amount,expense_date,status,notes,' + timestamps],
};

export function expandSeed(seed, day) {
  if (seed?.version !== 1) throw new Error('Expected a version 1 demo seed');
  const result = { ...seed };
  for (const key of Object.keys(businessTables)) {
    if (!Array.isArray(seed[key])) throw new Error('Missing seed array ' + key);
    const field = dateFields[key];
    if (field) {
      result[key] = seed[key].map(row => ({ ...row, [field]: expandDate(row?.[field], day) }));
    }
  }
  return result;
}
