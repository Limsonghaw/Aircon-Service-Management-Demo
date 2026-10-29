import { ApiValidationError } from './ApiValidationError'
import { uploadAttachment, type AttachmentProgress } from './attachmentUpload'
import type { AttachmentItem } from '../components/Attachments'

export type ReferenceDocument = AttachmentItem
type DocumentKind = 'quote' | 'invoice'
const base = (kind: DocumentKind, documentId: string) => `/api/documents/${kind}/${encodeURIComponent(documentId)}/reference-pdfs`

export async function getReferenceDocuments(kind: DocumentKind, documentId: string) {
  const response = await fetch(base(kind, documentId), { cache: 'no-store' })
  if (!response.ok) throw new ApiValidationError('参考原件 PDF 列表读取失败，请重试。', {}, response.status)
  const items = await response.json() as ReferenceDocument[]
  if (!Array.isArray(items)) throw new Error('参考原件 PDF 列表未确认，请重试。')
  return items
}
export async function uploadReferenceDocument(kind: DocumentKind, documentId: string, uploadId: string, file: File, onProgress: (progress: AttachmentProgress) => void) {
  const saved = await uploadAttachment<ReferenceDocument>(`${base(kind, documentId)}/${encodeURIComponent(uploadId)}`, file, onProgress,
    (message, _uncertain, status) => new ApiValidationError(message, {}, status))
  if (!saved || saved.id !== uploadId || saved.contentType !== 'application/pdf' || saved.fileSize !== file.size
    || typeof saved.fileName !== 'string' || !saved.fileName.trim()
    || typeof saved.uploadedByName !== 'string' || !saved.uploadedByName.trim()
    || typeof saved.createdAt !== 'string' || !Number.isFinite(Date.parse(saved.createdAt)))
    throw new Error('参考原件 PDF 保存结果未确认。文件已保留，请重试同一文件。')
  return saved
}
export const referenceDocumentUrl = (kind: DocumentKind, documentId: string, attachmentId: string, download = false) =>
  `${base(kind, documentId)}/${encodeURIComponent(attachmentId)}/file${download ? '?download=true' : ''}`
