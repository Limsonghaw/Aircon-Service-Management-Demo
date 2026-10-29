import { ApiValidationError } from './ApiValidationError'
import { uploadAttachment, type AttachmentProgress } from './attachmentUpload'
import type { AttachmentItem } from '../components/Attachments'

export type CustomerReturnedDocument = AttachmentItem
export const returnedMaxBytes = 10 * 1024 * 1024
type DocumentKind = 'quote' | 'invoice'
const base = (kind: DocumentKind, documentId: string) => `/api/documents/${kind}/${encodeURIComponent(documentId)}/customer-returned-pdfs`

// getRandomValues also works on the existing LAN HTTP preview (randomUUID does not).
export function createReturnedUploadId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export async function getCustomerReturnedDocuments(kind: DocumentKind, documentId: string) {
  const response = await fetch(base(kind, documentId), { cache: 'no-store' })
  if (!response.ok) throw new ApiValidationError('客户签回 PDF 列表读取失败，请重试。', {}, response.status)
  const items = await response.json() as CustomerReturnedDocument[]
  if (!Array.isArray(items)) throw new Error('客户签回 PDF 列表未确认，请重试。')
  return items
}
export async function uploadCustomerReturnedDocument(kind: DocumentKind, documentId: string, uploadId: string, file: File, onProgress: (progress: AttachmentProgress) => void) {
  const saved = await uploadAttachment<CustomerReturnedDocument>(`${base(kind, documentId)}/${encodeURIComponent(uploadId)}`, file, onProgress,
    (message, _uncertain, status) => new ApiValidationError(message, {}, status))
  if (!saved || saved.id !== uploadId || saved.contentType !== 'application/pdf' || saved.fileSize !== file.size
    || typeof saved.fileName !== 'string' || !saved.fileName.trim()
    || typeof saved.uploadedByName !== 'string' || !saved.uploadedByName.trim()
    || typeof saved.createdAt !== 'string' || !Number.isFinite(Date.parse(saved.createdAt)))
    throw new Error('客户签回 PDF 保存结果未确认。文件已保留，请重试同一文件。')
  return saved
}
export const customerReturnedDocumentUrl = (kind: DocumentKind, documentId: string, attachmentId: string, download = false) =>
  `${base(kind, documentId)}/${encodeURIComponent(attachmentId)}/file${download ? '?download=true' : ''}`
