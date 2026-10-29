import { ApiValidationError } from './ApiValidationError'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'overdue'

export type Invoice = {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  amount: number
  dueDate: string
  status: InvoiceStatus
  notes: string | null
  createdAt: string
  updatedAt: string
  items: { description: string; quantity: number; unitPrice: number }[] | null
  discount: number
}

export type InvoiceInput = Pick<Invoice, 'invoiceNumber' | 'customerId' | 'amount' | 'dueDate' | 'status' | 'notes'> & {
  items: NonNullable<Invoice['items']>; discount: number
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    let message = '发票请求失败，请稍后再试。'
    let fields: Record<string, string[]> = {}
    try {
      const problem = await response.json() as { title?: string; detail?: string; errors?: Record<string, string[]> }
      fields = problem.errors ?? {}
      message = problem.detail ?? (Object.values(fields).flat().join(' ') || problem.title || message)
    } catch {
      // The API may return an empty error response.
    }
    throw new ApiValidationError(message, fields, response.status)
  }

  return response.json() as Promise<T>
}

export const getInvoices = () => request<Invoice[]>('/api/invoices')

export const createInvoice = (input: InvoiceInput) => request<Invoice>('/api/invoices', {
  method: 'POST', body: JSON.stringify(input),
})

export async function updateInvoice(id: string, input: InvoiceInput) {
  const saved = await request<Invoice>(`/api/invoices/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  if (!saved || saved.id !== id || saved.status !== input.status) throw new Error('发票保存结果未确认，请刷新单据核对。')
  return saved
}
