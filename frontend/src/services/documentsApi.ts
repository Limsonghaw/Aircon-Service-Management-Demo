import type { Customer } from './customersApi'
import type { Invoice } from './invoicesApi'
import type { Quote } from './quotesApi'

export type DocumentKind = 'quote' | 'invoice'
export type SignaturePoint = { x: number; y: number }
export type PrintFields = { date: string; reference: string; attention: string; term: string; serviceMan: string }
export type SignatureSummary = { id: string; signerName: string; signedAt: string; isCurrent: boolean }
export type SavedSignature = { id: string; updatedAt: string; strokes: SignaturePoint[][] }
export type SavedSignatureContext = { signature: SavedSignature | null }
export type SigningContext = {
  version: string
  history: SignatureSummary[]
  snapshot: { document: Record<string, unknown>; customer: Record<string, unknown>; items: Record<string, unknown>[] }
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    let message = '签名请求失败，请稍后重试。'
    try { const error = await response.json() as { detail?: string }; message = error.detail ?? message } catch { /* Empty API error. */ }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}
const base = (kind: DocumentKind, id: string) => `/api/documents/${kind}/${id}`
export const getSigningContext = (kind: DocumentKind, id: string) => request<SigningContext>(`${base(kind, id)}/signing-context`)
export const signDocument = (kind: DocumentKind, id: string, version: string, fields: PrintFields, strokes: SignaturePoint[][]) =>
  request<SignatureSummary>(`${base(kind, id)}/sign`, { method: 'POST', body: JSON.stringify({ version, fields, strokes }) })
export const signedPdfUrl = (kind: DocumentKind, id: string, signatureId: string) => `${base(kind, id)}/signed/${signatureId}/pdf`
export const getMySignature = () => request<SavedSignatureContext>('/api/documents/my-signature', { cache: 'no-store' })
export const saveMySignature = (strokes: SignaturePoint[][], expectedId: string | null) =>
  request<SavedSignature>('/api/documents/my-signature', { method: 'PUT', body: JSON.stringify({ strokes, expectedId }) })

// Do not sign a fresh server version when the visible preview is stale.
export function matchesPreview(context: SigningContext, kind: DocumentKind, record: Quote | Invoice, customer: Customer) {
  const { document: d, customer: c, items } = context.snapshot
  const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '')
  if (!same(d.customer_id, record.customerId) || !same(d.status, record.status) || !same(d.notes, record.notes) ||
      !same(c.name, customer.name) || !same(c.address, customer.address) || !same(c.phone, customer.phone) || !same(c.email, customer.email)) return false
  if (kind === 'quote') {
    const q = record as Quote
    return same(d.quote_number, q.quoteNumber) && same(d.valid_until, q.validUntil) &&
      JSON.stringify(items.map(i => [i.description, i.quantity, i.unit_price])) === JSON.stringify(q.items.map(i => [i.description, i.quantity, i.unitPrice]))
  }
  const invoice = record as Invoice
  return same(d.invoice_number, invoice.invoiceNumber) && same(d.due_date, invoice.dueDate) && same(d.amount, invoice.amount) &&
    same(d.discount, invoice.discount) &&
    JSON.stringify(items.map(i => [i.description, i.quantity, i.unitPrice])) === JSON.stringify((invoice.items ?? []).map(i => [i.description, i.quantity, i.unitPrice]))
}
