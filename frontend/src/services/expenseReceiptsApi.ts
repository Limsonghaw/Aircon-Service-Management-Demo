import { uploadAttachment, type AttachmentProgress } from './attachmentUpload'
import { safeApiMessage } from './ApiValidationError'
export type ExpenseReceipt = {
  id: string; fileName: string; contentType: string; fileSize: number
  uploadedByName: string; createdAt: string
}
export const receiptMaxBytes = 10 * 1024 * 1024
const base = (expenseId: string) => `/api/expenses/${encodeURIComponent(expenseId)}/receipts`
export class ExpenseReceiptRequestError extends Error {
  readonly uncertain: boolean
  readonly status?: number
  constructor(message: string, uncertain: boolean, status?: number) { super(safeApiMessage(message, status)); this.uncertain = uncertain; this.status = status }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(url, { ...init, cache: 'no-store' }) }
  catch { if (!init?.method || init.method === 'GET') throw new TypeError('连接中断，请检查网络后重试。'); throw new ExpenseReceiptRequestError('连接中断，保存结果未确认。请刷新收据列表检查，避免重复上传。', true) }
  if (!response.ok) {
    let message = response.status === 413 ? '收据文件不能超过 10 MB。' : '收据请求失败，请稍后重试。'
    try {
      const problem = await response.json() as { detail?: string; errors?: Record<string, string[]> }
      message = problem.detail ?? (Object.values(problem.errors ?? {}).flat().join(' ') || message)
    } catch { /* Preserve fallback for non-JSON server responses. */ }
    throw new ExpenseReceiptRequestError(message, response.status >= 500, response.status)
  }
  try { return await response.json() as T }
  catch { throw new ExpenseReceiptRequestError('保存结果未确认，请刷新收据列表检查。', true) }
}
export const getExpenseReceipts = (expenseId: string, signal?: AbortSignal) =>
  request<ExpenseReceipt[]>(base(expenseId), { signal })
export function uploadExpenseReceipt(expenseId: string, file: File, onProgress?: (progress: AttachmentProgress) => void) {
  if (onProgress) return uploadAttachment<ExpenseReceipt>(base(expenseId), file, onProgress, (message, uncertain, status) => new ExpenseReceiptRequestError(message, uncertain, status))
  const body = new FormData()
  body.append('file', file)
  // Let the browser set the multipart boundary; do not set Content-Type here.
  return request<ExpenseReceipt>(base(expenseId), { method: 'POST', body })
}
export const expenseReceiptUrl = (expenseId: string, receiptId: string, download = false) =>
  `${base(expenseId)}/${encodeURIComponent(receiptId)}/file${download ? '?download=true' : ''}`
