import test from 'node:test'
import assert from 'node:assert/strict'
import { isColdStartError, waitForBackend, withRequestTimeout } from '../src/utils/coldStart.ts'

test('only network errors, timeouts, and gateway failures trigger waking', () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    new Error('Failed to fetch'),
    new DOMException('Timed out', 'TimeoutError'),
    ...[502, 503, 504].map(status => ({ status })),
  ]) assert.equal(isColdStartError(error), true)

  for (const status of [400, 401, 403, 404, 500]) {
    assert.equal(isColdStartError(Object.assign(new TypeError('Failed to fetch'), { status })), false)
  }
  assert.equal(isColdStartError(new DOMException('Cancelled', 'AbortError')), false)
  assert.equal(isColdStartError(new Error('Unexpected error')), false)
})

test('health polling retries until healthy', async () => {
  let time = 0
  const starts = []
  const result = await waitForBackend({
    signal: new AbortController().signal,
    maxWaitMs: 90,
    pollMs: 4,
    now: () => time,
    sleep: async ms => { time += ms },
    fetchImpl: async (url, options) => {
      assert.equal(url, '/api/health')
      assert.equal(options.method, 'GET')
      starts.push(time)
      if (starts.length === 1) throw new TypeError('Failed to fetch')
      return new Response(null, { status: starts.length === 3 ? 204 : 503 })
    },
  })
  assert.equal(result, true)
  assert.deepEqual(starts, [0, 4, 8])
})

test('polling stops at the deadline without another request', async () => {
  let time = 0
  const starts = []
  const result = await waitForBackend({
    signal: new AbortController().signal,
    maxWaitMs: 10,
    pollMs: 4,
    now: () => time,
    sleep: async ms => { time += ms },
    fetchImpl: async () => {
      starts.push(time)
      return new Response(null, { status: 503 })
    },
  })
  assert.equal(result, false)
  assert.equal(time, 10)
  assert.deepEqual(starts, [0, 4, 8])
})

test('request deadlines abort the request with a recognized cold-start error', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let requestSignal
  const result = withRequestTimeout(signal => {
    requestSignal = signal
    return new Promise(() => {})
  }, new AbortController().signal, 10)
  t.mock.timers.tick(10)
  await assert.rejects(result, isColdStartError)
  assert.equal(requestSignal.aborted, true)
})

test('abort stops an in-flight health request and clears its timeout', async t => {
  const clearTimer = t.mock.method(globalThis, 'clearTimeout')
  const controller = new AbortController()
  let requestSignal
  const result = waitForBackend({
    signal: controller.signal,
    fetchImpl: (_url, { signal }) => {
      requestSignal = signal
      return new Promise(() => {})
    },
  })
  controller.abort()
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(requestSignal.aborted, true)
  assert.equal(clearTimer.mock.callCount(), 1)
})

test('abort clears a pending poll delay', async t => {
  const clearTimer = t.mock.method(globalThis, 'clearTimeout')
  const controller = new AbortController()
  const result = waitForBackend({
    signal: controller.signal,
    now: () => 0,
    fetchImpl: async () => new Response(null, { status: 503 }),
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(clearTimer.mock.callCount(), 1)
  controller.abort()
  await assert.rejects(result, { name: 'AbortError' })
  assert.equal(clearTimer.mock.callCount(), 2)
})
