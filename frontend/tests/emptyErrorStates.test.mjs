import test from 'node:test'
import assert from 'node:assert/strict'
import { loadFailure } from '../src/utils/loadFailure.ts'
import { ApiValidationError, safeApiMessage } from '../src/services/ApiValidationError.ts'

test('unauthenticated and denied requests have distinct safe explanations', () => {
  assert.equal(loadFailure(new ApiValidationError('secret', {}, 401)).kind, 'session')
  assert.equal(loadFailure(new ApiValidationError('secret', {}, 403)).kind, 'permission')
})
test('network errors stay distinct from server and unexpected exceptions', () => {
  assert.equal(loadFailure(new TypeError('Failed to fetch')).kind, 'network')
  assert.equal(loadFailure(new Error('postgres SQLSTATE password')).kind, 'server')
  assert.doesNotMatch(loadFailure(new Error('postgres SQLSTATE password')).message, /postgres|SQLSTATE|password/)
  assert.equal(loadFailure(null).kind, 'server')
})
test('server and permission errors cannot expose backend validation fields', () => {
  for (const status of [401,403,500,503]) {
    const error = new ApiValidationError('System.Exception service_role API_KEY', {Secret:['database password']}, status)
    assert.deepEqual(error.fields, {})
    assert.doesNotMatch(error.message, /Exception|service_role|API_KEY/)
  }
})
test('field validation stays available without exposing stack traces', () => {
  const fields = {Phone:['请输入联系电话。']}
  assert.deepEqual(new ApiValidationError('请检查输入。', fields, 400).fields, fields)
  assert.deepEqual(new ApiValidationError('请检查输入。', fields, 422).fields, fields)
  assert.equal(safeApiMessage('客户名称已存在。',409),'客户名称已存在。')
  assert.doesNotMatch(safeApiMessage('Exception postgres SELECT * FROM users',400),/postgres|SELECT/)
})

test('validation fields cannot reveal technical stack and database text', () => {
  const error = new ApiValidationError('请检查输入。',{Phone:['System.Exception SQLSTATE postgres']},400)
  assert.doesNotMatch(error.fields.Phone[0],/Exception|postgres|SQLSTATE/)
})
