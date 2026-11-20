import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { proxyApiRequest } from '../functions/api/proxy.ts'

const pages = 'https://demo.pages.dev'
const origin = 'https://backend.example'
const health = new Request(pages + '/api/health')

test('forwards the API path, query and method to the configured origin', async () => {
  const request = new Request(pages + '/api/health?x=1&next=https://elsewhere.example/')
  const fetchUpstream = mock.fn(async () => new Response('ok'))
  const response = await proxyApiRequest(request, origin + '/', fetchUpstream)
  assert.equal(fetchUpstream.mock.callCount(), 1)
  const [url, init] = fetchUpstream.mock.calls[0].arguments
  assert.equal(url.href, origin + '/api/health?x=1&next=https://elsewhere.example/')
  assert.equal(init.method, 'GET')
  assert.equal(await response.text(), 'ok')
})

test('streams the POST body and forwards end-to-end request headers', async () => {
  const request = new Request(pages + '/api/auth/login', {
    method: 'POST',
    body: '{"example":true}',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session=example',
      Host: 'demo.pages.dev',
      'X-Forwarded-Host': 'elsewhere.example',
      Connection: 'x-hop, malformed header',
      'X-Hop': 'remove',
      'Keep-Alive': 'timeout=5',
      'Proxy-Authorization': 'example',
    },
  })
  const fetchUpstream = mock.fn(async (_url, init) => {
    return new Response(await new Response(init.body).text())
  })
  const response = await proxyApiRequest(request, origin, fetchUpstream)
  assert.equal(await response.text(), '{"example":true}')
  const [url, init] = fetchUpstream.mock.calls[0].arguments
  assert.equal(url.origin, origin)
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.get('host'), 'backend.example')
  assert.ok(init.headers.get('cookie') === 'session=example', 'Cookie is forwarded')
  assert.equal(init.headers.get('content-type'), 'application/json')
  for (const name of ['connection', 'x-hop', 'keep-alive', 'proxy-authorization']) {
    assert.equal(init.headers.has(name), false)
  }
})

test('preserves separate cookies and their flags while removing Domain', async () => {
  const cookies = [
    'shengheng.session=example; Path=/; HttpOnly; SameSite=Strict; Secure',
    'other=example; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Max-Age=100; Path=/api',
  ]
  const headers = new Headers({
    'Transfer-Encoding': 'chunked',
    Connection: 'x-hop',
    'X-Hop': 'remove',
    'Content-Type': 'application/json',
  })
  headers.append('Set-Cookie', cookies[0] + '; Domain=.backend.example')
  headers.append('Set-Cookie', cookies[1].replace('; Max-Age', '; dOmAiN=backend.example; Max-Age'))
  const response = await proxyApiRequest(health, origin, async () => new Response('{}', { headers }))
  const actual = response.headers.getSetCookie()
  assert.ok(actual.length === cookies.length && cookies.every((cookie, i) => actual[i] === cookie),
    'Separate host-only cookies retain their other attributes')
  for (const name of ['transfer-encoding', 'connection', 'x-hop']) {
    assert.equal(response.headers.has(name), false)
  }
  assert.equal(response.headers.get('content-type'), 'application/json')
})

test('returns a generic 502 when fetch throws', async () => {
  const response = await proxyApiRequest(health, origin, async () => {
    throw new Error('internal connection details')
  })
  assert.equal(response.status, 502)
  assert.equal(await response.text(), 'Upstream request failed.')
})

test('aborts a timed-out fetch and returns a generic 504', async () => {
  const fetchUpstream = mock.fn((_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }))
  const response = await proxyApiRequest(health, origin, fetchUpstream, 1)
  assert.equal(response.status, 504)
  assert.equal(await response.text(), 'Upstream request timed out.')
  assert.equal(fetchUpstream.mock.calls[0].arguments[1].signal.aborted, true)
})

test('returns a generic 500 for absent or invalid API origins before fetching', async () => {
  const fetchUpstream = mock.fn()
  for (const binding of [undefined, '', ' ', '/relative', 'https://', 'ftp://backend.example',
    origin + '/path', origin + '?', origin + '#', 'https://user@backend.example']) {
    const response = await proxyApiRequest(health, binding, fetchUpstream)
    assert.equal(response.status, 500)
    assert.equal(await response.text(), 'Proxy configuration error.')
  }
  assert.equal(fetchUpstream.mock.callCount(), 0)
})

test('rejects non-API paths and paths resembling alternate upstream URLs', async () => {
  const fetchUpstream = mock.fn()
  for (const path of ['/quotes/demo', '//elsewhere.example/api/health',
    '/api//elsewhere.example/health', '/api/https://elsewhere.example/',
    '/api//user@elsewhere.example/', '/api/\\elsewhere.example/',
    '/api/%5Celsewhere.example/', '/api/../%2felsewhere.example/']) {
    const response = await proxyApiRequest(new Request(pages + path), origin, fetchUpstream)
    assert.equal(response.status, 400, path)
    assert.equal(await response.text(), 'Invalid API request.')
  }
  assert.equal(fetchUpstream.mock.callCount(), 0)
})

test('passes through upstream redirects without following them', async () => {
  const fetchUpstream = mock.fn(async () => Response.redirect('https://elsewhere.example/'))
  const response = await proxyApiRequest(health, origin, fetchUpstream)
  assert.equal(response.status, 302)
  assert.equal(fetchUpstream.mock.callCount(), 1)
  assert.equal(fetchUpstream.mock.calls[0].arguments[1].redirect, 'manual')
})

test('passes through real upstream 401 and 503 responses', async () => {
  for (const status of [401, 503]) {
    const response = await proxyApiRequest(health, origin, async () => new Response('upstream', { status }))
    assert.equal(response.status, status)
    assert.equal(await response.text(), 'upstream')
  }
})
