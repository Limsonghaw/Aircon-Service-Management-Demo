// Keep the existing primary order; IDs make equal values deterministic across refetches.
export function stableListSort<T extends { id: string }>(items: T[], compare?: (a: T, b: T) => number): T[] {
  if (!compare) return [...items]
  return [...items].sort((a, b) => (compare(a, b) || a.id.localeCompare(b.id, 'en', { numeric: true })))
}
export const dateSort = (a: string, b: string) => (a || '').localeCompare(b || '')
export const amountSortOptions = { amountDesc: '金额：从高到低', amountAsc: '金额：从低到高' }

// Preserve the API's primary collation (especially mixed Chinese/Latin names).
// Only identical primary values use the common ID tie-breaker.
export function serverOrder<T>(items: T[], group: (item: T) => string) {
  const ranks = new Map<string, number>()
  for (const item of items) if (!ranks.has(group(item))) ranks.set(group(item), ranks.size)
  return (a: T, b: T) => ranks.get(group(a))! - ranks.get(group(b))!
}
