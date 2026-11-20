export const coldStartDefaults = { maxWaitMs: 90_000, pollMs: 4_000, requestTimeoutMs: 10_000 }

class RequestTimeout extends DOMException {
  constructor() {
    super('Request timed out', 'AbortError')
  }
}

export function isColdStartError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return error.status === 502 || error.status === 503 || error.status === 504
  }
  return error instanceof RequestTimeout ||
    error instanceof TypeError ||
    (error instanceof Error && (error.name === 'TimeoutError' || /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(error.message)))
}

export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<T> {
  signal.throwIfAborted()
  const controller = new AbortController()
  const abort = () => controller.abort(signal.reason)
  signal.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => controller.abort(new RequestTimeout()), timeoutMs)
  try {
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
    })
    return await Promise.race([cancelled, request(controller.signal)])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function sleepUntilPoll(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    function abort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

type WaitOptions = {
  signal: AbortSignal
  maxWaitMs?: number
  pollMs?: number
  fetchImpl?: typeof fetch
  now?: () => number
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  healthUrl?: string
}

export async function waitForBackend({
  signal,
  maxWaitMs = coldStartDefaults.maxWaitMs,
  pollMs = coldStartDefaults.pollMs,
  fetchImpl = fetch,
  now = () => performance.now(),
  sleep = sleepUntilPoll,
  healthUrl = '/api/health',
}: WaitOptions): Promise<boolean> {
  const deadline = now() + maxWaitMs
  while (true) {
    signal.throwIfAborted()
    const started = now()
    if (started >= deadline) return false
    try {
      const response = await withRequestTimeout(
        requestSignal => fetchImpl(healthUrl, { method: 'GET', cache: 'no-store', signal: requestSignal }),
        signal,
        Math.min(pollMs, 5_000, deadline - started),
      )
      signal.throwIfAborted()
      if (response.ok && now() < deadline) return true
    } catch {
      signal.throwIfAborted()
    }
    const delay = Math.min(started + pollMs, deadline) - now()
    if (delay > 0) await sleep(delay, signal)
  }
}
