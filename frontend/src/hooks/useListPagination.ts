import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useSearchParams } from 'react-router-dom'
import { paginate } from '../utils/listPagination'

export function useListPagination<T>(items: T[], ready = false) {
  const [params, setParams] = useSearchParams()
  const result = paginate(items, Number(params.get('page')), Number(params.get('pageSize')))
  const location = useLocation()
  const { user } = useAuth()
  useLayoutEffect(() => {
    if (!ready || Number(params.get('page')) <= result.pageCount) return
    const next = new URLSearchParams(params)
    next.set('page', String(result.page))
    setParams(next, { replace: true, state: { ...location.state, restoreList: location.state?.restoreList ?? (user?.id ?? '') + ':' + location.key + ':' + location.pathname } })
  }, [ready, params, result.pageCount, result.page, setParams, location.state, location.key, location.pathname, user?.id])
  function update(key: string, value: string) {
    setParams(current => {
      const next = new URLSearchParams(current)
      if (value) next.set(key, value)
      else next.delete(key)
      next.delete('page')
      return next
    }, { replace: true })
  }
  function setPage(value: number) {
    setParams(current => {
      const next = new URLSearchParams(current)
      next.set('page', String(Math.max(1, Math.min(result.pageCount, value))))
      return next
    })
  }
  return { ...result, setPage, setPageSize: (value: number) => update('pageSize', String(value)) }
}

export function useListParam(key: string, fallback = '') {
  const [params, setParams] = useSearchParams()
  return [params.get(key) ?? fallback, (value: string) => setParams(current => {
    const next = new URLSearchParams(current)
    if (value && value !== fallback) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    return next
  }, { replace: true })] as const
}

export function useClearListFilters() {
  const [, setParams] = useSearchParams()
  return () => setParams(current => {
    const next = new URLSearchParams(current)
    for (const key of ['q', 'date', 'status', 'team', 'filter', 'type', 'source', 'page']) next.delete(key)
    return next
  }, { replace: true })
}
