import test from 'node:test'
import assert from 'node:assert/strict'
import { financialReport } from '../src/utils/financialReport.ts'
const invoice = (status, amount, createdAt = '2026-10-02T00:00:00Z') => ({ status, amount, createdAt, dueDate: '2026-12-01' })
const expense = (status, amount, expenseDate = '2026-10-02') => ({ status, amount, expenseDate })
const quote = (status, total, validUntil = '2026-10-02') => ({ status, total, validUntil })

test('empty data returns zero totals', () => {
  assert.deepEqual(financialReport([], [], []), { invalidRange: false, invoiced: 0, collected: 0, outstanding: 0,
    confirmedExpenses: 0, pendingExpenses: 0, acceptedQuotes: 0, netCash: 0 })
})
test('payment states: partial contributes only to invoiced total', () => {
  const result = financialReport([invoice('paid', 10), invoice('partial', 20), invoice('unpaid', 30), invoice('overdue', 40)], [], [])
  assert.equal(result.invoiced, 100)
  assert.equal(result.collected, 10)
  assert.equal(result.outstanding, 70)
})
test('expense and quote states remain separate; negative net cash is allowed', () => {
  const result = financialReport([invoice('paid', 10)], [expense('confirmed', 30), expense('pending', 40)],
    [quote('accepted', 50), quote('draft', 60), quote('sent', 70), quote('rejected', 80)])
  assert.equal(result.confirmedExpenses, 30)
  assert.equal(result.pendingExpenses, 40)
  assert.equal(result.acceptedQuotes, 50)
  assert.equal(result.netCash, -20)
})
test('money sums and subtraction are exact at cent precision', () => {
  const result = financialReport([invoice('paid', 0.1), invoice('paid', 0.2)], [expense('confirmed', 0.1)], [quote('accepted', 0.1), quote('accepted', 0.2)])
  assert.equal(result.invoiced, 0.3)
  assert.equal(result.collected, 0.3)
  assert.equal(result.netCash, 0.2)
  assert.equal(result.acceptedQuotes, 0.3)
})
test('both date boundaries are inclusive and use each existing date basis', () => {
  const dates = ['2026-09-30', '2026-10-01', '2026-10-31', '2026-11-01']
  const result = financialReport(dates.map(date => invoice('paid', 10, `${date}T23:59:59Z`)),
    dates.map(date => expense('confirmed', 20, date)), dates.map(date => quote('accepted', 30, date)), '2026-10-01', '2026-10-31')
  assert.equal(result.collected, 20)
  assert.equal(result.confirmedExpenses, 40)
  assert.equal(result.acceptedQuotes, 60)
})
test('open-ended and cleared filters work across years', () => {
  const invoices = [invoice('paid', 10, '2025-12-31T00:00:00Z'), invoice('paid', 20, '2026-01-01T00:00:00Z')]
  assert.equal(financialReport(invoices, [], [], '2026-01-01').collected, 20)
  assert.equal(financialReport(invoices, [], [], '', '2025-12-31').collected, 10)
  assert.equal(financialReport(invoices, [], []).collected, 30)
})
test('reversed dates are flagged instead of displaying plausible report totals', () => {
  const result = financialReport([invoice('paid', 100)], [], [], '2026-10-31', '2026-10-01')
  assert.equal(result.invalidRange, true)
})
