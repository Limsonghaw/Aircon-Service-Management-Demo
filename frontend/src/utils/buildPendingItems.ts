import { isOverdueInvoice } from './dashboardTasks'
import type { Expense } from '../services/expensesApi'
import type { Invoice } from '../services/invoicesApi'
import { quoteStatusLabels, type Quote } from '../services/quotesApi'
import { formatCurrency } from './formatCurrency'

export type PendingItem = { id: string; title: string; detail: string; path: string }

export function buildPendingItems(quotes: Quote[], invoices: Invoice[], expenses: Expense[]): PendingItem[] {
  return [
    ...quotes.filter((quote) => quote.status === 'sent').map((quote) => ({
      id: `quote-${quote.id}`,
      title: '报价等待确认',
      detail: `${quote.quoteNumber} · ${quote.customerName} · ${quoteStatusLabels[quote.status]}`,
      path: `/quotes/${quote.id}`,
    })),
    ...invoices.filter((invoice) => ['unpaid', 'partial', 'overdue'].includes(invoice.status)).map((invoice) => ({
      id: `invoice-${invoice.id}`,
      title: isOverdueInvoice(invoice) ? '逾期发票等待付款' : '发票等待付款',
      detail: `${invoice.invoiceNumber} · ${invoice.customerName} · ${formatCurrency(invoice.amount)}`,
      path: isOverdueInvoice(invoice) ? '/invoices?filter=overdue' : '/invoices?filter=receivable',
    })),
    ...expenses.filter((expense) => expense.status === 'pending').map((expense) => ({
      id: `expense-${expense.id}`,
      title: '费用记录待检查',
      detail: `${expense.expenseNumber} · ${expense.description} · ${formatCurrency(expense.amount)}`,
      path: '/expenses?filter=pending',
    })),
  ]
}
