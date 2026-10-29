import test from 'node:test'
import assert from 'node:assert/strict'
import { dashboardMonth, dashboardSummary } from '../src/utils/dashboardSummary.ts'

const now = new Date('2026-10-01T04:00:00Z')
const job = (status, serviceDate = '2026-10-01') => ({ status, serviceDate })
const invoice = (status, amount) => ({ status, amount })

test('empty data produces actual zero totals', () => {
  assert.deepEqual(dashboardSummary([], [], now), { activeJobs: [], inProgress: 0, completedThisMonth: 0, collected: 0 })
})
test('active work includes pending, scheduled and in-progress, not completed', () => {
  const jobs = [job('pending'), job('scheduled'), job('in_progress'), job('completed')]
  const result = dashboardSummary(jobs, [], now)
  assert.deepEqual(result.activeJobs, jobs.slice(0, 3))
  assert.equal(result.inProgress, 1)
})
test('month completion uses service date, not status-change or creation dates', () => {
  const jobs = [job('completed', '2026-09-30'), job('completed', '2026-10-01'), job('completed', '2026-10-31'),
    job('completed', '2026-11-01'), job('in_progress', '2026-10-02')]
  assert.equal(dashboardSummary(jobs, [], now).completedThisMonth, 2)
})
test('business month follows Malaysia rather than UTC or device timezone', () => {
  assert.equal(dashboardMonth(new Date('2026-09-30T15:59:59Z')), '2026-09')
  assert.equal(dashboardMonth(new Date('2026-09-30T16:00:00Z')), '2026-10')
  assert.equal(dashboardMonth(new Date('2026-12-31T16:00:00Z')), '2027-01')
})
test('only fully paid invoice amounts count as collected', () => {
  assert.equal(dashboardSummary([], [invoice('paid', 123.45), invoice('unpaid', 100), invoice('partial', 200),
    invoice('overdue', 300), invoice('paid', 20)], now).collected, 143.45)
})
test('collected includes all months, not just current-month invoices', () => {
  assert.equal(dashboardSummary([], [{ ...invoice('paid', 50), createdAt: '2026-09-01' },
    { ...invoice('paid', 75), createdAt: '2026-10-01' }], now).collected, 125)
})
test('money aggregation uses cents to avoid floating-point drift', () => {
  assert.equal(dashboardSummary([], [invoice('paid', 0.1), invoice('paid', 0.2)], now).collected, 0.3)
})
