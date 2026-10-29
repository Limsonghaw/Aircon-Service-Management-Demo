import { matchesListDate } from './listDateFilter.ts'
import type { DocumentArchive } from '../services/documentArchivesApi'

export const documentSourceOptions = { system: '系统建立', archive: '历史归档' }
type CommonRow = { id: string; number: string; customerName: string; date: string | null; amount: number | null; search: string[] }
export type DocumentListRow<T> = CommonRow & ({ source: 'system'; document: T } | { source: 'archive'; document: DocumentArchive })

// A presentation-only union. Archive rows never become Invoice/Quote business objects.
export function documentList<T extends { id: string }>(systems: T[], archives: DocumentArchive[],
  describe: (document: T) => Omit<CommonRow, 'id'>, matchesSystem: (document: T) => boolean,
  options: { source: string; search: string; date: string; sort: string; businessFilter: boolean }): DocumentListRow<T>[] {
  const rows: DocumentListRow<T>[] = [
    ...systems.filter(matchesSystem).map(document => ({ ...describe(document), id: `system:${document.id}`, source: 'system' as const, document })),
    ...(!options.businessFilter ? archives.map(document => ({ id: `archive:${document.id}`, source: 'archive' as const, document,
      number: document.originalNumber || '原编号未填写', customerName: document.customerName,
      date: document.originalDate, amount: null, search: [document.originalNumber ?? '', document.customerName, document.fileName, '历史归档'] })) : []),
  ]
  const query = options.search.trim().toLocaleLowerCase()
  const filtered = rows.filter(row => (!options.source || row.source === options.source)
    && matchesListDate(row.date ?? '', options.date)
    && [...row.search, documentSourceOptions[row.source]].some(value => value.toLocaleLowerCase().includes(query)))
  return filtered.sort((a, b) => {
    const amount = options.sort.startsWith('amount')
    const left = amount ? a.amount : a.date
    const right = amount ? b.amount : b.date
    // Null is unknown, never zero, in both directions.
    if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1
    const compared = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return (options.sort.endsWith('Asc') ? compared : -compared) || a.id.localeCompare(b.id)
  })
}
