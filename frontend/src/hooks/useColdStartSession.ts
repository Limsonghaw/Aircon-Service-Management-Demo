import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../services/authApi'
import { coldStartDefaults, isColdStartError, waitForBackend, withRequestTimeout } from '../utils/coldStart'
import { loadFailure, type LoadFailure } from '../utils/loadFailure'

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

const maxWaitMs = positiveNumber(import.meta.env.VITE_COLD_START_MAX_WAIT_MS, coldStartDefaults.maxWaitMs)
const pollMs = positiveNumber(import.meta.env.VITE_COLD_START_POLL_MS, coldStartDefaults.pollMs)
const requestTimeoutMs = positiveNumber(import.meta.env.VITE_COLD_START_REQUEST_TIMEOUT_MS, coldStartDefaults.requestTimeoutMs)

export function useColdStartSession() {
  const [data, setData] = useState<AuthUser | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [isWaking, setWaking] = useState(false)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const active = useRef<AbortController | null>(null)

  const retry = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const { signal } = controller
    setLoading(true)
    setWaking(false)
    setFailure(null)

    async function loadUser() {
      const requestUser = () => withRequestTimeout(getCurrentUser, signal, requestTimeoutMs)
      let user: AuthUser | null
      try {
        user = await requestUser()
      } catch (error) {
        signal.throwIfAborted()
        if (!isColdStartError(error)) throw error
        setWaking(true)
        if (!await waitForBackend({ signal, maxWaitMs, pollMs })) {
          if (!signal.aborted) setFailure({ kind: 'server', message: '服务器暂时没有回应，请稍后重试。' })
          return
        }
        user = await requestUser()
      }
      if (!signal.aborted) {
        setData(user)
        setLoaded(true)
      }
    }

    void loadUser().catch(error => {
      if (!signal.aborted) setFailure(loadFailure(error))
    }).finally(() => {
      if (!signal.aborted) {
        active.current = null
        setWaking(false)
        setLoading(false)
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) retry() })
    return () => { cancelled = true; active.current?.abort() }
  }, [retry])

  return { data, setData, loaded, isLoading, isWaking, failure, retry }
}
