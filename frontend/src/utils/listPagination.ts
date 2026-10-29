export function paginate<T>(items: T[], requestedPage: number, requestedSize: number) {
  const pageSize = [10, 20, 50].includes(requestedSize) ? requestedSize : 20
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(pageCount, Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1)
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, pageCount }
}
