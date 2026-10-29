export const listPaths = ['/customers', '/jobs', '/quotes', '/invoices', '/expenses'] as const
export type Position = { key: string; user: string; path: string; url: string; index: number; y: number; row?: string; rowIndex?: number; top?: number }
export function listUrl(path: string, search: string) {
  const params = new URLSearchParams(search)
  for (const key of ['panel', 'record', 'view', 'create']) params.delete(key)
  return path + (params.size ? '?' + params.toString() : '')
}
export function readPanel(search: string) {
  const params = new URLSearchParams(search)
  return { kind: params.get('panel') ?? (params.get('view') ? 'view' : params.get('create') === '1' ? 'create' : ''), id: params.get('record') ?? params.get('view') ?? '' }
}
export function fallbackRow<T>(rows: T[], savedIndex = 0) { return rows[Math.max(0, Math.min(savedIndex, rows.length - 1))] }
export function validOrigin(value: unknown, user: string): value is Position {
  if (!value || typeof value !== 'object') return false
  const p = value as Position
  return p.user === user && listPaths.includes(p.path as typeof listPaths[number]) && typeof p.url === 'string' && p.url.startsWith(p.path) && p.url === listUrl(p.path, p.url.slice(p.path.length)) && typeof p.key === 'string' && Number.isInteger(p.index)
}

export function sameListConditions(a: string, b: string) {
  const first = new URL(a, 'http://local'), second = new URL(b, 'http://local')
  first.searchParams.delete('page'); second.searchParams.delete('page')
  first.searchParams.sort(); second.searchParams.sort()
  return first.pathname === second.pathname && first.search === second.search
}

export function rememberPosition(positions: Map<string, Position>, position: Position) {
  positions.delete(position.key)
  positions.set(position.key, position)
}
export function preferredPosition(current: Position | undefined, source: Position | undefined, path: string, url: string, defaultList = false) {
  if (current?.path === path && current.url === url) return current
  return defaultList ? undefined : source
}
// Display-only changes keep mounted forms and selected files; panel/record navigation does not.
export function isListDisplayChange(current: { pathname: string; search: string }, next: { pathname: string; search: string }) {
  if (current.pathname !== next.pathname || !listPaths.includes(current.pathname as typeof listPaths[number]) || current.search === next.search) return false
  const remaining = (search: string) => {
    const params = new URLSearchParams(search)
    for (const key of ['q', 'source', 'status', 'date', 'sort', 'page', 'pageSize', 'team', 'filter', 'type']) params.delete(key)
    params.sort()
    return params.toString()
  }
  return remaining(current.search) === remaining(next.search)
}
