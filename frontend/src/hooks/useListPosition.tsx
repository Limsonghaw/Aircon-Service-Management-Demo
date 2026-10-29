import { translate as t } from '../i18n'
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { fallbackRow, listPaths, listUrl, readPanel, rememberPosition, preferredPosition, sameListConditions, validOrigin, type Position } from '../utils/listReturn'
import './useListPosition.css'
import { isListDisplayChange } from '../utils/listReturn'

const positions = new Map<string, Position>()
const latest = new Map<string, Position>()
const hydrated = new Set<string>()
function readPositions(user: string) {
  if (hydrated.has(user)) return
  hydrated.add(user)
  try {
    const saved = JSON.parse(sessionStorage.getItem('list-positions:' + user) ?? '[]') as Position[]
    for (const p of saved) if (p.user === user && typeof p.key === 'string' && typeof p.url === 'string' && p.url.startsWith('/')) { positions.set(p.key, p); latest.set(user + p.path, p) }
  } catch { /* Storage is optional; in-memory navigation still works. */ }
}
function remember(p: Position) {
  rememberPosition(positions, p); latest.set(p.user + p.path, p)
  try { sessionStorage.setItem('list-positions:' + p.user, JSON.stringify([...positions.values()].filter(x => x.user === p.user).slice(-80))) } catch { /* Private-mode/quota limitations must not prevent returning. */ }
}
function visibleRows(root: HTMLElement | null) { return [...(root?.querySelectorAll<HTMLElement>('[data-list-row]') ?? [])].filter(row => row.getBoundingClientRect().height > 0) }
function historyIndex() { return Number(window.history.state?.idx ?? 0) }

// Stores only navigation metadata, separated by signed-in user and history entry.
export function useListPosition(ready: boolean) {
  const { user } = useAuth()
  const account = user?.id ?? ''
  readPositions(account)
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const root = useRef<HTMLElement>(null)
  const key = account + ':' + location.key + ':' + location.pathname
  const url = listUrl(location.pathname, location.search)
  const isList = listPaths.includes(location.pathname as typeof listPaths[number])
  const panel = readPanel(location.search)
  const origin: Position = { key, user: account, path: location.pathname, url, index: historyIndex(), y: 0 }
  const [restoring, setRestoring] = useState(false)
  const pending = useRef<Position | null>(null)
  const restored = useRef('')
  const departing = useRef(false)
  const previousLocation = useRef(location)

  function capture(id?: string) {
    if (panel.kind) return (location.state as { panelOrigin?: Position } | null)?.panelOrigin ?? positions.get(key) ?? origin
    if (departing.current || restored.current !== key) return positions.get(key) ?? origin
    const rows = visibleRows(root.current)
    const selected = id ? rows.find(row => row.dataset.listRow === id) : rows.find(row => row.getBoundingClientRect().bottom > 70)
    const p = { ...origin, y: window.scrollY, ...(selected ? { row: selected.dataset.listRow, rowIndex: rows.indexOf(selected), top: selected.getBoundingClientRect().top } : {}) }
    remember(p); return p
  }
  const captureRef = useRef(capture)
  useLayoutEffect(() => { captureRef.current = capture })

  useLayoutEffect(() => {
    const previous = previousLocation.current
    previousLocation.current = location
    if (panel.kind) return
    departing.current = false
    // Typing replaces URL query parameters, but is not a return to the list.
    // Keep native input focus and scroll instead of scrolling to the page heading.
    if (navigationType === 'REPLACE' && isListDisplayChange(previous, location)) {
      pending.current = null
      restored.current = key
      queueMicrotask(() => setRestoring(false))
      return
    }
    const state = location.state as { restoreList?: string; defaultList?: boolean } | null
    if (isList && navigationType === 'PUSH' && !location.search && !state?.defaultList) {
      const last = latest.get(account + location.pathname)
      if (last && last.url !== url) { navigate(last.url, { replace: true, state: { restoreList: last.key } }); return }
    }
    const own = positions.get(key)
    const source = positions.get(state?.restoreList ?? key) ?? (isList && navigationType === 'PUSH' && !location.search ? latest.get(account + location.pathname) : undefined)
    const saved = preferredPosition(own, source, location.pathname, url, state?.defaultList)
    pending.current = saved?.path === location.pathname && (saved.url === url || (state?.restoreList && sameListConditions(saved.url, url))) ? saved : null
    restored.current = ''
    if (!pending.current) { window.scrollTo({ top: 0, behavior: 'instant' }); restored.current = key }
    queueMicrotask(() => setRestoring(!!pending.current))
  }, [key, url, panel.kind, account, isList, location, navigate, navigationType])

  const previousReady = useRef({ key, ready })
  useLayoutEffect(() => {
    if (previousReady.current.key === key && previousReady.current.ready && !ready && !panel.kind && !pending.current) {
      pending.current = positions.get(key) ?? null
      if (pending.current) restored.current = ''
      queueMicrotask(() => setRestoring(!!pending.current))
    }
    previousReady.current = { key, ready }
  }, [ready, key, panel.kind])

  useLayoutEffect(() => {
    if (!ready || panel.kind || !pending.current) return
    const saved = pending.current
    let cancelled = false
    // Rows are committed before paint; fonts can affect card heights on first load.
    const restore = () => {
      if (cancelled) return
      const rows = visibleRows(root.current)
      const row = rows.find(row => row.dataset.listRow === saved.row) ?? (saved.row ? fallbackRow(rows, saved.rowIndex) : undefined)
      const y = row && saved.top !== undefined ? window.scrollY + row.getBoundingClientRect().top - saved.top : rows.length || !isList ? saved.y : 0
      window.scrollTo({ top: Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight)), behavior: 'instant' })
      pending.current = null; restored.current = key; setRestoring(false)
      captureRef.current(saved.row)
    }
    let frame = 0
    const schedule = () => { if (!cancelled) frame = requestAnimationFrame(restore) }
    if (document.fonts.status === 'loaded') schedule()
    else void document.fonts.ready.then(schedule)
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [ready, key, url, panel.kind, isList])

  useEffect(() => {
    if (panel.kind) return
    let frame = 0
    const save = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => captureRef.current()) }
    const leaving = (event: globalThis.MouseEvent) => {
      if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element)?.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.target === '_blank' || link.origin !== window.location.origin) return
      const row = link.closest<HTMLElement>('[data-list-row]')
      captureRef.current(row?.dataset.listRow)
      departing.current = true
    }
    window.addEventListener('scroll', save, { passive: true })
    document.addEventListener('click', leaving, true)
    return () => { window.removeEventListener('scroll', save); document.removeEventListener('click', leaving, true); cancelAnimationFrame(frame) }
  }, [key, panel.kind])

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-list-row]')
    if (row) capture(row.dataset.listRow)
    else if (!panel.kind) capture()
    if ((event.target as HTMLElement).closest('a[href]') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) departing.current = true
  }
  return { capture: (id?: string) => { const p = capture(id); departing.current = true; return p }, restorationNotice: restoring ? <div className="list-return-notice" role="status">{t("列表位置已保留，资料就绪后恢复。")}</div> : null, linkState: { listOrigin: panel.kind ? ((location.state as { panelOrigin?: Position } | null)?.panelOrigin ?? origin) : origin }, rootProps: { ref: root, onClickCapture, 'data-list-restoring': restoring, 'data-list-ready': ready, 'data-list-path': location.pathname } }
}

// Local panels are history entries too, so Back/Forward opens and closes the same record.
export function usePanelNavigation(ready: boolean, onChange: (kind: string, id: string) => void, capture?: (id?: string) => Position, onReturn?: () => void) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const account = user?.id ?? ''
  const panel = readPanel(location.search)
  const change = useRef(onChange)
  const refresh = useRef(onReturn)
  const last = useRef('initial')
  const closing = useRef(0)
  useLayoutEffect(() => { change.current = onChange; refresh.current = onReturn })
  useLayoutEffect(() => {
    const identity = panel.kind + ':' + panel.id
    if ((!panel.kind || ready) && last.current !== identity) {
      const returned = !panel.kind && last.current !== 'initial' && last.current !== ':'
      last.current = identity
      change.current(panel.kind, panel.id)
      if (returned) refresh.current?.()
    }
  }, [panel.kind, panel.id, ready])
  function open(kind: string, id = '') {
    cancelAnimationFrame(closing.current)
    if (panel.kind === kind && panel.id === id) return
    const p = (panel.kind ? (location.state as { panelOrigin?: Position } | null)?.panelOrigin : undefined) ?? capture?.(id) ?? { key: account + ':' + location.key + ':' + location.pathname, user: account, path: location.pathname, url: listUrl(location.pathname, location.search), index: historyIndex(), y: window.scrollY }
    remember(p)
    const params = new URLSearchParams(location.search)
    for (const key of ['view', 'create']) params.delete(key)
    params.set('panel', kind); if (id) params.set('record', id); else params.delete('record')
    navigate(location.pathname + '?' + params.toString(), { replace: !!panel.kind, state: { ...location.state, panelOrigin: p } })
  }
  function close() {
    if (!panel.kind) return
    const p = (location.state as { panelOrigin?: Position } | null)?.panelOrigin
    // Let form/upload guards unregister after their approved close/save, then navigate.
    cancelAnimationFrame(closing.current)
    closing.current = requestAnimationFrame(() => {
      if ((window.history.state?.key ?? 'default') !== location.key) return
      if (p?.user === account && historyIndex() === p.index + 1) navigate(-1)
      else navigate(listUrl(location.pathname, location.search), { replace: true, state: { ...location.state, restoreList: p?.key } })
    })
  }
  return { open, close, kind: panel.kind, id: panel.id }
}

export function getListOrigin(candidate: unknown, user: string) {
  readPositions(user)
  return validOrigin(candidate, user) ? (candidate.row || candidate.y ? candidate : positions.get(candidate.key)) : undefined
}

export function restoreListOrigin(origin: Position) { remember(origin) }
