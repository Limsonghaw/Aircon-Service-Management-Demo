import { ApiValidationError } from './ApiValidationError'
import { notifyJobsChanged } from './jobChanges'
export const quoteStatusLabels = { draft: '草稿', sent: '已发送', accepted: '已接受', rejected: '已拒绝' } as const
export type QuoteStatus = keyof typeof quoteStatusLabels
export type QuoteItemInput = { description: string; quantity: number; unitPrice: number }
export type QuoteInput = {
  quoteNumber: string; customerId: string; validUntil: string; status: QuoteStatus
  notes: string | null; items: QuoteItemInput[]
}
export type Quote = Omit<QuoteInput, 'items'> & {
  id: string; customerName: string; total: number
  items: (QuoteItemInput & { id: string; subtotal: number })[]
  invoiceId: string | null; jobId: string | null
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
  if (!response.ok) {
    let message = response.status === 404 ? '找不到这张报价单。' : '报价请求失败，请稍后重试。'
    let fields: Record<string, string[]> = {}
    try {
      const problem = await response.json() as { detail?: string; errors?: Record<string, string[]> }
      fields = problem.errors ?? {}
      message = problem.detail ?? (Object.values(problem.errors ?? {}).flat().join(' ') || message)
    } catch { /* Keep the fallback message for non-JSON errors. */ }
    throw new ApiValidationError(message, fields, response.status)
  }
  return response.json() as Promise<T>
}
export const getQuotes = () => request<Quote[]>('/api/quotes')
export async function updateQuoteStatus(id: string, status: QuoteStatus) {
  const saved = await request<Quote>(`/api/quotes/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  })
  if (!saved || saved.id !== id || saved.status !== status) throw new Error('报价状态保存结果未确认，请刷新单据核对。')
  return saved
}
export const getQuote = (id: string) => request<Quote>(`/api/quotes/${encodeURIComponent(id)}`)
export const saveQuote = (id: string | null, input: QuoteInput) => request<Quote>(id ? `/api/quotes/${id}` : '/api/quotes', {
  method: id ? 'PUT' : 'POST', body: JSON.stringify(input),
})
export const convertQuoteToInvoice = (id: string, input: { invoiceNumber: string; dueDate: string }) =>
  request<{ id: string }>(`/api/quotes/${id}/invoice`, { method: 'POST', body: JSON.stringify(input) })
export const convertQuoteToJob = async (id: string, input: { jobNumber: string; title: string; serviceDate: string; team: string }) => {
  const result = await request<{ id: string }>(`/api/quotes/${id}/job`, { method: 'POST', body: JSON.stringify(input) })
  notifyJobsChanged()
  return result
}
export const itemSubtotal = (item: QuoteItemInput) => Math.round((item.quantity * item.unitPrice + Number.EPSILON) * 100) / 100
