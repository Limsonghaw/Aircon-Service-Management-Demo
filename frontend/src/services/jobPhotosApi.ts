import { uploadAttachment, type AttachmentProgress } from './attachmentUpload'
import { safeApiMessage } from './ApiValidationError'
export type JobPhoto = {
  id: string; fileName: string; contentType: string; fileSize: number
  uploadedByName: string; createdAt: string
}
export const photoMaxBytes = 10 * 1024 * 1024
const base = (jobId: string) => `/api/jobs/${encodeURIComponent(jobId)}/photos`
export class JobPhotoRequestError extends Error {
  readonly uncertain: boolean
  readonly status?: number
  constructor(message: string, uncertain: boolean, status?: number) { super(safeApiMessage(message, status)); this.uncertain = uncertain; this.status = status }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(url, { ...init, cache: 'no-store' }) }
  catch { if (!init?.method || init.method === 'GET') throw new TypeError('连接中断，请检查网络后重试。'); throw new JobPhotoRequestError('连接中断，保存结果未确认。请刷新照片列表检查，确认未保存后再重试，避免重复。', true) }
  if (!response.ok) {
    let message = response.status === 413 ? '每张照片不能超过 10 MB。' : '工作照片请求失败，请稍后重试。'
    try {
      const problem = await response.json() as { detail?: string; errors?: Record<string, string[]> }
      message = problem.detail ?? (Object.values(problem.errors ?? {}).flat().join(' ') || message)
    } catch { /* Preserve safe fallback. */ }
    throw new JobPhotoRequestError(message, response.status >= 500, response.status)
  }
  try { return await response.json() as T }
  catch { throw new JobPhotoRequestError('保存结果未确认，请刷新照片列表检查。', true) }
}
export const getJobPhotos = (jobId: string, signal?: AbortSignal) => request<JobPhoto[]>(base(jobId), { signal })
export function uploadJobPhoto(jobId: string, file: File, onProgress?: (progress: AttachmentProgress) => void) {
  if (onProgress) return uploadAttachment<JobPhoto>(base(jobId), file, onProgress, (message, uncertain, status) => new JobPhotoRequestError(message, uncertain, status))
  const body = new FormData(); body.append('file', file)
  return request<JobPhoto>(base(jobId), { method: 'POST', body })
}
export const jobPhotoUrl = (jobId: string, photoId: string, download = false) =>
  `${base(jobId)}/${encodeURIComponent(photoId)}/file${download ? '?download=true' : ''}`
