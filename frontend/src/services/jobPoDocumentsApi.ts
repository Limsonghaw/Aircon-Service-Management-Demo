import { ApiValidationError } from './ApiValidationError'
import { uploadAttachment, type AttachmentProgress } from './attachmentUpload'
import type { AttachmentItem } from '../components/Attachments'

export type JobPoDocument = AttachmentItem
export const poMaxBytes = 10 * 1024 * 1024
const base = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/po-documents`

// getRandomValues also works on the existing LAN HTTP preview (randomUUID does not).
export function createPoUploadId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export async function getJobPoDocuments(jobId: string) {
  const response = await fetch(base(jobId), { cache: 'no-store' })
  if (!response.ok) throw new ApiValidationError('PO PDF 列表读取失败，请重试。', {}, response.status)
  const items = await response.json() as JobPoDocument[]
  if (!Array.isArray(items)) throw new Error('PO PDF 列表未确认，请重试。')
  return items
}
export async function uploadJobPoDocument(jobId: string, uploadId: string, file: File, onProgress: (progress: AttachmentProgress) => void) {
  const saved = await uploadAttachment<JobPoDocument>(`${base(jobId)}/${encodeURIComponent(uploadId)}`, file, onProgress,
    (message, _uncertain, status) => new ApiValidationError(message, {}, status))
  if (saved.id !== uploadId || saved.contentType !== 'application/pdf' || saved.fileSize !== file.size)
    throw new Error('PO PDF 保存结果未确认。文件已保留，请重试同一文件。')
  return saved
}
export const jobPoDocumentUrl = (jobId: string, documentId: string, download = false) =>
  `${base(jobId)}/${encodeURIComponent(documentId)}/file${download ? '?download=true' : ''}`
