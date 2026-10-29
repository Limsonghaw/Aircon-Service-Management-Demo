import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDays, calendarJobGroups, calendarDateLabel, shiftCalendarMonth } from '../src/utils/calendarJobs.ts'
import { businessDate } from '../src/utils/dashboardTasks.ts'

const jobs = [
  { id: 'a', serviceDate: '2026-10-06', createdAt: '2026-09-01', team: 'A', status: 'scheduled' },
  { id: 'b', serviceDate: '2026-10-06', createdAt: '2026-09-02', team: 'B', status: 'completed' },
  { id: 'c', serviceDate: '2026-10-02', createdAt: '2026-10-06', team: 'A', status: 'pending' },
]

test('counts and agenda share service-date groups for empty, single and multiple days', () => {
  const groups = calendarJobGroups(jobs)
  assert.equal(groups.get('2026-10-07'), undefined)
  assert.deepEqual(groups.get('2026-10-02'), [jobs[2]])
  assert.deepEqual(groups.get('2026-10-06'), [jobs[0], jobs[1]])
  assert.equal(groups.has('2026-09-01'), false)
})
test('team and status apply together to the same groups; permitted input remains restricted', () => {
  assert.deepEqual(calendarJobGroups(jobs, 'A', 'scheduled').get('2026-10-06'), [jobs[0]])
  assert.equal(calendarJobGroups(jobs, 'B', 'scheduled').size, 0)
  assert.deepEqual(calendarJobGroups(jobs.filter(job => job.team === 'A')).get('2026-10-06'), [jobs[0]])
})
test('create, delete and reschedule rebuild both original and destination dates', () => {
  const changed = jobs.map(job => job.id === 'a' ? { ...job, serviceDate: '2026-10-07' } : job)
  assert.equal(calendarJobGroups(changed).get('2026-10-06').length, 1)
  assert.equal(calendarJobGroups(changed).get('2026-10-07').length, 1)
  assert.equal(calendarJobGroups([...jobs, { ...jobs[0], id: 'new' }]).get('2026-10-06').length, 3)
  assert.equal(calendarJobGroups(jobs.filter(job => job.id !== 'a')).get('2026-10-06').length, 1)
})
test('Monday-based 42-cell calendar preserves month/year boundaries and leap days', () => {
  assert.equal(calendarDays('2026-10')[0], '2026-09-28')
  assert.equal(calendarDays('2026-10')[41], '2026-11-08')
  assert.equal(calendarDays('2027-01')[0], '2026-12-28')
  assert.ok(calendarDays('2028-02').includes('2028-02-29'))
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01')
  assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12')
  assert.equal(calendarDateLabel('2026-10-06'), '2026年10月6日')
})
test('Malaysia today rolls over at 16:00 UTC without shifting civil service dates', () => {
  assert.equal(businessDate(new Date('2026-12-31T15:59:59Z')), '2026-12-31')
  assert.equal(businessDate(new Date('2026-12-31T16:00:00Z')), '2027-01-01')
  assert.equal(calendarJobGroups([{ ...jobs[0], serviceDate: '2026-12-31' }]).get('2026-12-31').length, 1)
})
