import { ApiValidationError } from './ApiValidationError'
export type ArchiveKind = 'quote' | 'invoice'
export type DocumentArchive = {
  id: string; kind: ArchiveKind; customerId: string; customerName: string;
  originalNumber: string | null; originalDate: string | null; fileName: string; fileSize: number; createdAt: string
}
const base = (kind: ArchiveKind) => `/api/document-archives/${kind}`
export const archiveFileUrl = (kind: ArchiveKind, id: string, download = false) => `${base(kind)}/${encodeURIComponent(id)}/file${download ? '?download=true' : ''}`
export async function getDocumentArchives(kind: ArchiveKind): Promise<DocumentArchive[]> {
  const response = await fetch(base(kind), { cache: 'no-store' })
  if (!response.ok) throw new ApiValidationError('历史归档读取失败，请重试；尚未执行归档迁移时暂不可使用。原有单据不受影响。', {}, response.status)
  const result = await response.json()
  if (!Array.isArray(result)) throw new Error('归档列表结果未确认。')
  return result
}
export async function saveDocumentArchive(kind: ArchiveKind, id: string, file: File,
  metadata: { customerId: string; originalNumber: string; originalDate: string }, confirmDuplicate: boolean): Promise<DocumentArchive> {
  const body = new FormData()
  body.append('file', file)
  body.append('customerId', metadata.customerId)
  body.append('originalNumber', metadata.originalNumber.trim())
  if (metadata.originalDate) body.append('originalDate', metadata.originalDate)
  body.append('confirmDuplicate', String(confirmDuplicate))
  const response = await fetch(`${base(kind)}/${encodeURIComponent(id)}`, { method: 'POST', body, signal: AbortSignal.timeout(240_000) })
  if (!response.ok) {
    let message = '归档保存未确认，请重试同一文件。'
    try { const error = await response.json(); if (typeof error.detail === 'string') message = error.detail } catch { /* Do not display HTML. */ }
    throw new ApiValidationError(message, {}, response.status)
  }
  const saved = await response.json() as DocumentArchive
  if (saved.id !== id || saved.kind !== kind || saved.customerId !== metadata.customerId || saved.fileSize !== file.size
    || saved.originalNumber !== (metadata.originalNumber.trim() || null) || saved.originalDate !== (metadata.originalDate || null)
    || !Number.isFinite(Date.parse(saved.createdAt))) throw new Error('归档保存结果未确认，请重试同一文件。')
  return saved
}
