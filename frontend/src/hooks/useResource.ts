import { useCallback, useEffect, useRef, useState } from 'react'
import { loadFailure, type LoadFailure } from '../utils/loadFailure'

// Last successful data stays available during refresh; request locks apply before rendering.
export function useResource<T>(loader: () => Promise<T>, initial: T, enabled = true) {
  const [data, setData] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const [isLoading, setLoading] = useState(enabled)
  const [failure, setFailure] = useState<LoadFailure | null>(null)
  const generation = useRef(0)
  const active = useRef(false)
  const reload = useCallback(async () => {
    if (!enabled || active.current) return
    active.current = true
    const version = ++generation.current
    setLoading(true)
    try {
      const result = await loader()
      if (generation.current === version) { setData(result); setLoaded(true); setFailure(null) }
    } catch (error) {
      if (generation.current === version) setFailure(loadFailure(error))
    } finally {
      if (generation.current === version) { active.current = false; setLoading(false) }
    }
  }, [loader, enabled])
  const retry = useCallback(() => { void reload() }, [reload])
  const invalidate = useCallback(() => { generation.current++; active.current = false }, [])
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) retry() })
    return () => { cancelled = true; invalidate() }
  }, [retry, invalidate])
  const restricted = failure?.kind === 'permission' || failure?.kind === 'session'
  const blockAccess = (error: unknown) => { const next = loadFailure(error); if (next.kind === 'session' || next.kind === 'permission') setFailure(next) }
  return { data, setData, loaded, isLoading, failure, error: failure?.message ?? null, retry, reload, available: loaded && !restricted, restricted, blockAccess }
}
