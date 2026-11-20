const hopByHopHeaders = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]

function endToEndHeaders(source: Headers): Headers {
  const headers = new Headers(source)
  // Connection can nominate additional headers for this hop only.
  const connectionHeaders = (source.get('connection') ?? '').toLowerCase().split(',')
  const blocked = new Set([...hopByHopHeaders, ...connectionHeaders.map(name => name.trim())])
  source.forEach((_value, name) => {
    if (blocked.has(name)) headers.delete(name)
  })
  return headers
}

function getOrigin(value?: string): URL | null {
  const origin = value?.trim() ?? ''
  if (!/^https?:\/\/[^/\\@?#\s]+\/?$/i.test(origin)) return null
  return URL.parse(origin)
}

function isApiPath(path: string): boolean {
  if (!path.startsWith('/api/')) return false
  const suffix = path.slice('/api/'.length)
  return !/^(?:\/|%2f|[a-z][a-z\d+.-]*:)|\\|%5c/i.test(suffix)
}

export async function proxyApiRequest(
  request: Request,
  apiOrigin?: string,
  fetchUpstream: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<Response> {
  const origin = getOrigin(apiOrigin)
  if (!origin) return new Response('Proxy configuration error.', { status: 500 })

  const incoming = URL.parse(request.url)
  // Check the raw path too, before URL parsing can normalize backslashes or dot segments.
  const rawPath = /^https?:\/\/[^/\\?#]+([^?#]*)/i.exec(request.url)?.[1] ?? ''
  if (!incoming || !isApiPath(rawPath) || !isApiPath(incoming.pathname)) {
    return new Response('Invalid API request.', { status: 400 })
  }

  const upstream = new URL(origin.origin + incoming.pathname + incoming.search)
  if (upstream.origin !== origin.origin) {
    return new Response('Invalid API request.', { status: 400 })
  }

  const headers = endToEndHeaders(request.headers)
  headers.set('host', origin.hostname)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    const init = {
      method: request.method,
      headers,
      body: request.body,
      duplex: 'half',
      redirect: 'manual' as const,
      signal: controller.signal,
    }
    response = await fetchUpstream(upstream, init)
  } catch {
    return controller.signal.aborted
      ? new Response('Upstream request timed out.', { status: 504 })
      : new Response('Upstream request failed.', { status: 502 })
  } finally {
    clearTimeout(timer)
  }

  const responseHeaders = endToEndHeaders(response.headers)
  if (responseHeaders.has('set-cookie')) {
    const source = response.headers as Headers & { getAll?: (name: string) => string[] }
    // Workers also exposes getAll for Set-Cookie. Commas can be part of Expires.
    const cookies = source.getSetCookie?.() ?? source.getAll?.('set-cookie') ?? []
    responseHeaders.delete('set-cookie')
    for (const cookie of cookies) {
      responseHeaders.append('set-cookie', cookie.replace(/;\s*domain\s*=[^;]*/gi, ''))
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}
