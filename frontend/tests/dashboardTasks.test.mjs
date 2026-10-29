import test from 'node:test'
import assert from 'node:assert/strict'
import { businessDate, dashboardTasks } from '../src/utils/dashboardTasks.ts'

test('today follows Malaysia across UTC midnight and year boundaries', () => {
  assert.equal(businessDate(new Date('2026-10-01T16:00:00Z')), '2026-10-02')
  assert.equal(businessDate(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
})

test('today work includes completed jobs but excludes other service dates', () => {
  const jobs = [{ serviceDate: '2026-10-02', status: 'completed' }, { serviceDate: '2026-10-01', status: 'scheduled' }]
  assert.deepEqual(dashboardTasks(jobs, [], new Date('2026-10-02T04:00:00Z')).todayJobs, [jobs[0]])
})

test('overdue and other receivables are disjoint, include partial payments, and exclude paid invoices', () => {
  const invoices = [
    { id: 'paid', status: 'paid', dueDate: '2026-09-01' },
    { id: 'late', status: 'unpaid', dueDate: '2026-10-01' },
    { id: 'partial', status: 'partial', dueDate: '2026-10-01' },
    { id: 'today', status: 'unpaid', dueDate: '2026-10-02' },
    { id: 'future', status: 'partial', dueDate: '2026-10-03' },
    { id: 'flagged', status: 'overdue', dueDate: '2026-10-03' },
  ]
  const result = dashboardTasks([], invoices, new Date('2026-10-02T04:00:00Z'))
  assert.deepEqual(result.overdue.map(invoice => invoice.id), ['late', 'partial', 'flagged'])
  assert.deepEqual(result.unpaid.map(invoice => invoice.id), ['today', 'future'])
})
