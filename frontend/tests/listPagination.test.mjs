import test from 'node:test'
import assert from 'node:assert/strict'
import { paginate } from '../src/utils/listPagination.ts'

test('pages contain every result once, including a partial last page', () => {
  const items = Array.from({ length: 25 }, (_, index) => index)
  const pages = [1, 2, 3].map(page => paginate(items, page, 10))
  assert.deepEqual(pages.map(page => page.items.length), [10, 10, 5])
  assert.deepEqual(pages.flatMap(page => page.items), items)
})

test('filtering or deleting the last page falls back to the last available page', () => {
  const result = paginate([1, 2, 3], 3, 10)
  assert.equal(result.page, 1)
  assert.deepEqual(result.items, [1, 2, 3])
  assert.equal(paginate([], 9, 10).page, 1)
})

test('invalid URL values fall back safely and supported page sizes are respected', () => {
  for (const value of [NaN, -1, 0, 1.5, Infinity]) {
    assert.equal(paginate([1], value, 5).page, 1)
    assert.equal(paginate([1], value, 5).pageSize, 20)
  }
  assert.equal(paginate(Array.from({ length: 25 }), 1, 20).items.length, 20)
  assert.equal(paginate(Array.from({ length: 25 }), 1, 50).pageCount, 1)
})
