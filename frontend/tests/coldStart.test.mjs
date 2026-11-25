import test from 'node:test'
import assert from 'node:assert/strict'
import { isColdStartError, renderWakeUrl, startRenderWake, waitForBackend, withRequestTimeout } from '../src/utils/coldStart.ts'
import { getCurrentUser } from '../src/services/authApi.ts'

test('browser wakes Render immediately and every 20 seconds until stopped', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  const { signal } = new AbortController()
  const stop = startRenderWake(signal)

  assert.equal(fetch.mock.callCount(), 1)
  assert.deepEqual(fetch.mock.calls[0].arguments, [renderWakeUrl, {
    mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal,
  }])
  t.mock.timers.tick(19_999)
  assert.equal(fetch.mock.callCount(), 1)
  t.mock.timers.tick(1)
  assert.equal(fetch.mock.callCount(), 2)
  stop()
  t.mock.timers.tick(20_000)
  assert.equal(fetch.mock.callCount(), 2)
})

test('health success keeps polling until the session endpoint is ready', async () => {
  let time = 0
  let sessionChecks = 0
  assert.equal(await waitForBackend({
    signal: new AbortController().signal,
    fetchImpl: async () => Response.json({ status: 'ok' }),
    now: () => time,
    sleep: async ms => { time += ms },
    confirmReady: async () => ++sessionChecks === 2,
  }), true)
  assert.equal(time, 4_000)
  assert.equal(sessionChecks, 2)
})

test('only a wake timeout renders the manual wake link alongside Retry', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const { createServer } = await import('vite')
  const server = await createServer({
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
  })
  globalThis.document = { documentElement: {} }
  try {
    const { default: App } = await server.ssrLoadModule('/src/App.tsx')
    const { AuthStateContext } = await server.ssrLoadModule('/src/contexts/authStateContext.ts')
    const { InteractionContext } = await server.ssrLoadModule('/src/contexts/InteractionContext.ts')
    const baseSession = { isWaking: false, isLoading: false, didWakeTimeOut: false, failure: null, retry() {} }
    const render = overrides => renderToStaticMarkup(createElement(MemoryRouter, null,
      createElement(InteractionContext.Provider, { value: {} },
        createElement(AuthStateContext.Provider, { value: { user: null, session: { ...baseSession, ...overrides } } },
          createElement(App)))))

    const timedOut = render({ didWakeTimeOut: true })
    assert.ok(timedOut.includes(`href="${renderWakeUrl}" target="_blank" rel="noopener noreferrer"`))
    assert.match(timedOut, /<button[^>]*>重试<\/button>/)
    assert.match(timedOut, /status: ok/)
    assert.match(render({ isWaking: true }), /正在唤醒服务器/)
    assert.match(render({}), /登录业务管理系统/)
    for (const state of [{}, { isWaking: true }, { failure: { kind: 'permission', message: 'Denied' } }]) {
      assert.ok(!render(state).includes(renderWakeUrl))
    }
  } finally {
    delete globalThis.document
    await server.close()
  }
})

test('network errors, timeouts, rate limits, HTML and gateway failures trigger waking', () => {
  for (const error of [
    new TypeError('Failed to fetch'),
    new Error('Failed to fetch'),
    new DOMException('Timed out', 'TimeoutError'),
    ...[429, 502, 503, 504].map(status => ({ status })),
    { status: 200, responseType: 'html' },
  ]) assert.equal(isColdStartError(error), true)

  for (const status of [400, 401, 403, 404, 500]) {
    assert.equal(isColdStartError(Object.assign(new TypeError('Failed to fetch'), { status })), false)
  }
  for (const status of [401, 403]) {
    assert.equal(isColdStartError({ status, responseType: 'html' }), false)
  }
  assert.equal(isColdStartError(new DOMException('Cancelled', 'AbortError')), false)
  assert.equal(isColdStartError(new Error('Unexpected error')), false)
})

test('current user preserves 429 and 503 status for the waking flow', async t => {
  for (const status of [429, 503]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'unavailable' }, { status }))
    await assert.rejects(getCurrentUser(), error => error.status === status && isColdStartError(error))
    t.mock.restoreAll()
  }
})

test('current user recognizes HTML with or without the correct content type', async t => {
  for (const [status, contentType] of [[200, 'text/html; charset=utf-8'], [200, 'application/json'], [500, 'text/plain']]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('<!DOCTYPE html><html>Just a moment…</html>', {
      status, headers: { 'Content-Type': contentType },
    }))
    await assert.rejects(getCurrentUser(), error => error.status === status && isColdStartError(error))
    t.mock.restoreAll()
  }
})

test('current user keeps 401 and 403 out of the waking flow even for HTML', async t => {
  for (const status of [401, 403]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('<html>Denied</html>', {
      status, headers: { 'Content-Type': 'text/html' },
    }))
    if (status === 401) assert.equal(await getCurrentUser(), null)
    else await assert.rejects(getCurrentUser(), error => error.status === 403 && !isColdStartError(error))
    t.mock.restoreAll()
  }
})

test('current user still returns valid JSON and does not classify unrelated JSON errors as cold starts', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 'test-user', role: 'owner' }))
  assert.deepEqual(await getCurrentUser(), { id: 'test-user', role: 'owner' })
  t.mock.restoreAll()
  t.mock.method(globalThis, 'fetch', async () => new Response('invalid JSON'))
  await assert.rejects(getCurrentUser(), error => error instanceof SyntaxError && !isColdStartError(error))
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
