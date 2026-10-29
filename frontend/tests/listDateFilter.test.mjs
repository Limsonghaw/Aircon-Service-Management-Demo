import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesListDate } from '../src/utils/listDateFilter.ts'

test('month and previous month handle year boundaries', () => {
 assert.equal(matchesListDate('2025-12-31', 'lastMonth', '2026-01-05'), true)
 assert.equal(matchesListDate('2026-01-01', 'lastMonth', '2026-01-05'), false)
 assert.equal(matchesListDate('2026-01-31', 'month', '2026-01-05'), true)
})
test('last seven days includes today and excludes future dates', () => {
 assert.equal(matchesListDate('2026-09-29', 'week', '2026-10-05'), true)
 assert.equal(matchesListDate('2026-09-28', 'week', '2026-10-05'), false)
 assert.equal(matchesListDate('2026-10-06', 'week', '2026-10-05'), false)
 assert.equal(matchesListDate('2026-10-05', 'today', '2026-10-05'), true)
 assert.equal(matchesListDate('2026-10-05', '', '2026-10-05'), true)
})
