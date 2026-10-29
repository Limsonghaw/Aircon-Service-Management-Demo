import { ApiValidationError } from './ApiValidationError'
export type ExpenseStatus = 'pending' | 'confirmed'
export const expenseStatusLabels: Record<ExpenseStatus, string> = { pending: '待检查', confirmed: '已确认' }
export type Expense = {
  id: string; expenseNumber: string; description: string; amount: number; expenseDate: string
  status: ExpenseStatus; notes: string | null; createdAt: string; updatedAt: string
}
export type ExpenseInput = Pick<Expense, 'expenseNumber' | 'description' | 'amount' | 'expenseDate' | 'status' | 'notes'>

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    let message = response.status === 404 ? '找不到这项费用。' : '费用请求失败，请稍后重试。'
    let fields: Record<string, string[]> = {}
    try {
      const problem = await response.json() as { detail?: string; errors?: Record<string, string[]> }
      fields = problem.errors ?? {}
      message = problem.detail ?? (Object.values(problem.errors ?? {}).flat().join(' ') || message)
    } catch { /* Keep fallback message for non-JSON errors. */ }
    throw new ApiValidationError(message, fields, response.status)
  }
  return response.json() as Promise<T>
}

export const getExpenses = () => request<Expense[]>('/api/expenses')
export const saveExpense = (id: string | null, input: ExpenseInput) => request<Expense>(
  id ? `/api/expenses/${id}` : '/api/expenses',
  { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) },
)
