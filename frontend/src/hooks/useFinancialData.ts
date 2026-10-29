import { getExpenses, type Expense } from '../services/expensesApi'
import { getInvoices, type Invoice } from '../services/invoicesApi'
import { getQuotes, type Quote } from '../services/quotesApi'
import { useResource } from './useResource'

export function useFinancialData(enabled = true) {
  const invoiceState = useResource(getInvoices, [] as Invoice[], enabled)
  const expenseState = useResource(getExpenses, [] as Expense[], enabled)
  const quoteState = useResource(getQuotes, [] as Quote[], enabled)
  return { invoices: invoiceState.data, expenses: expenseState.data, quotes: quoteState.data, invoiceState, expenseState, quoteState,
    isLoading: invoiceState.isLoading || expenseState.isLoading || quoteState.isLoading,
    error: invoiceState.error || expenseState.error || quoteState.error,
    retry: () => { invoiceState.retry(); expenseState.retry(); quoteState.retry() } }
}
