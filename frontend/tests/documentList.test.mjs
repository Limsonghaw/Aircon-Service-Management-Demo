import test from 'node:test'
import assert from 'node:assert/strict'
import { documentList } from '../src/utils/documentList.ts'
import { paginate } from '../src/utils/listPagination.ts'

const systems = [{ id: 'same', number: 'SYS-1', customerName: 'QA customer', amount: 0, date: '2026-10-14', status: 'paid' },
  { id: 'two', number: 'SYS-2', customerName: 'QA customer', amount: 100, date: '2026-10-15', status: 'unpaid' }]
const archives = [{ id: 'same', originalNumber: 'OLD-1', customerName: 'QA archive', originalDate: '2024-01-01', fileName: 'original.pdf' },
  { id: 'blank', originalNumber: null, customerName: 'QA archive', originalDate: null, fileName: 'other.pdf' }]
const describe = x => ({ ...x, search: [x.number, x.customerName] })
const options = { source: '', search: '', date: '', sort: '', businessFilter: false }
const list = changes => documentList(systems, archives, describe, () => true, { ...options, ...changes })
test('one list combines sources, separate keys prevent ID collisions', () => {
  const rows = list({}); assert.equal(rows.length, 4); assert.equal(new Set(rows.map(x => x.id)).size, 4)
  assert.equal(rows.filter(x => x.source === 'archive').length, 2)
  assert.ok(rows.filter(x => x.source === 'archive').every(x => x.amount === null))
})
test('source filters and shared search never mutate documents or their finances', () => {
  const before = JSON.stringify({ systems, archives })
  assert.equal(list({ source: 'system' }).length, 2); assert.equal(list({ source: 'archive' }).length, 2)
  assert.equal(list({ search: 'original.pdf' })[0].number, 'OLD-1')
  assert.equal(list({ search: 'SYS-1' })[0].source, 'system')
  assert.equal(list({ search: '历史归档' }).length, 2)
  assert.equal(JSON.stringify({ systems, archives }), before)
})
test('unknown amounts always sort after known amounts including a real zero', () => {
  for (const sort of ['amountAsc', 'amountDesc']) {
    const rows = list({ sort }); assert.equal(rows[2].amount, null); assert.equal(rows[3].amount, null)
    assert.equal(rows[sort === 'amountAsc' ? 0 : 1].amount, 0)
  }
})
test('shared dates use original archive dates, null last in either direction', () => {
  for (const sort of ['dateAsc', 'dateDesc']) assert.equal(list({ sort }).at(-1).date, null)
  assert.equal(list({ sort: 'dateAsc' })[0].number, 'OLD-1')
})
test('status and receivable contexts never include archives', () => {
  assert.equal(list({ businessFilter: true }).length, 2)
  assert.equal(list({ source: 'archive', businessFilter: true }).length, 0)
})
test('archives alone are real list results and participate in a single pagination', () => {
  const rows = documentList([], Array.from({ length: 23 }, (_, i) => ({ ...archives[0], id: String(i) })), describe, () => true, options)
  assert.equal(rows.length, 23); assert.equal(paginate(rows, 1, 20).total, 23)
  assert.equal(paginate(rows, 2, 20).items.length, 3)
})
