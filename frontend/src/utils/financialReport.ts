import type { Invoice } from '../services/invoicesApi'
import type { Expense } from '../services/expensesApi'
import type { Quote } from '../services/quotesApi'

// Keep the existing report date basis: invoice creation, expense date, quote validity.
// Paid status does not provide actual payment amounts or payment dates.
export function financialReport(invoices: Invoice[], expenses: Expense[], quotes: Quote[], dateFrom = '', dateTo = '') {
  const invalidRange = Boolean(dateFrom && dateTo && dateFrom > dateTo)
  const inRange = (date: string) => !invalidRange && (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo)
  const filteredInvoices = invoices.filter(invoice => inRange(invoice.createdAt.slice(0, 10)))
  const filteredExpenses = expenses.filter(expense => inRange(expense.expenseDate))
  const filteredQuotes = quotes.filter(quote => inRange(quote.validUntil))
  const sumCents = <T,>(items: T[], amount: (item: T) => number) =>
    items.reduce((total, item) => total + Math.round(amount(item) * 100), 0)
  const invoiced = sumCents(filteredInvoices, invoice => invoice.amount)
  const collected = sumCents(filteredInvoices.filter(invoice => invoice.status === 'paid'), invoice => invoice.amount)
  const outstanding = sumCents(filteredInvoices.filter(invoice => invoice.status === 'unpaid' || invoice.status === 'overdue'), invoice => invoice.amount)
  const confirmedExpenses = sumCents(filteredExpenses.filter(expense => expense.status === 'confirmed'), expense => expense.amount)
  const pendingExpenses = sumCents(filteredExpenses.filter(expense => expense.status === 'pending'), expense => expense.amount)
  const acceptedQuotes = sumCents(filteredQuotes.filter(quote => quote.status === 'accepted'), quote => quote.total)
  return { invalidRange, invoiced: invoiced / 100, collected: collected / 100, outstanding: outstanding / 100,
    confirmedExpenses: confirmedExpenses / 100, pendingExpenses: pendingExpenses / 100,
    acceptedQuotes: acceptedQuotes / 100, netCash: (collected - confirmedExpenses) / 100 }
}
