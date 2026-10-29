import test from 'node:test'
import assert from 'node:assert/strict'
import { isListDisplayChange } from '../src/utils/listReturn.ts'
const location = (search, pathname = '/quotes') => ({ pathname, search })
test('typing, clearing search and display filters preserve the mounted draft', () => {
  assert.equal(isListDisplayChange(location(''), location('?q=diam')), true)
  assert.equal(isListDisplayChange(location('?q=diam'), location('')), true)
  assert.equal(isListDisplayChange(location('?panel=create&q=a'), location('?panel=create&q=b&source=archive&page=2')), true)
})
test('actual page and panel navigation must retain unsaved-content protection', () => {
  for (const next of [location('?panel=create'), location('?record=another'), location('?view=one'), location('?create=1'), location('', '/invoices'), location('?unknown=1')])
    assert.equal(isListDisplayChange(location(''), next), false)
  assert.equal(isListDisplayChange(location('?panel=create&q=a'), location('?q=b')), false)
  assert.equal(isListDisplayChange(location('?q=a', '/users'), location('?q=b', '/users')), false)
  assert.equal(isListDisplayChange(location('?q=a'), location('?q=a')), false)
})
