import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentUser, type AuthUser } from '../services/authApi'
import { coldStartDefaults, isColdStartError, startRenderWake, waitForBackend, withRequestTimeout } from '../utils/coldStart'
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
  const [didWakeTimeOut, setDidWakeTimeOut] = useState(false)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const active = useRef<AbortController | null>(null)

  const retry = useCallback(() => {
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const { signal } = controller
    setLoading(true)
    setWaking(false)
    setDidWakeTimeOut(false)
    setFailure(null)

    const stopRenderWake = startRenderWake(signal)
    async function loadUser() {
      const requestUser = (timeout = requestTimeoutMs) => withRequestTimeout(getCurrentUser, signal, timeout)
      let user: AuthUser | null = null
      try {
        user = await requestUser()
      } catch (error) {
        signal.throwIfAborted()
        if (!isColdStartError(error)) throw error
        setWaking(true)
        const ready = await waitForBackend({
          signal, maxWaitMs, pollMs,
          confirmReady: async remainingMs => {
            try {
              user = await requestUser(Math.min(requestTimeoutMs, remainingMs))
              return true
            } catch (error) {
              signal.throwIfAborted()
              if (!isColdStartError(error)) throw error
              return false
            }
          },
        })
        if (!ready) {
          if (!signal.aborted) setDidWakeTimeOut(true)
          return
        }
      }
      if (!signal.aborted) {
        setData(user)
        setLoaded(true)
      }
    }

    void loadUser().catch(error => {
      if (!signal.aborted) setFailure(loadFailure(error))
    }).finally(() => {
      stopRenderWake()
      if (!signal.aborted) {
        active.current = null
        setWaking(false)
        setLoading(false)
        controller.abort()
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) retry() })
    return () => { cancelled = true; active.current?.abort() }
  }, [retry])

  return { data, setData, loaded, isLoading, isWaking, didWakeTimeOut, failure, retry }
}
