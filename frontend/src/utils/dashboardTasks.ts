import type { CustomerJob } from '../services/customersApi'
import type { Invoice } from '../services/invoicesApi'

export function businessDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function dashboardTasks(jobs: CustomerJob[], invoices: Invoice[], now = new Date()) {
  const today = businessDate(now)
  const overdue = invoices.filter(invoice => isOverdueInvoice(invoice, today))
  const overdueIds = new Set(overdue.map(invoice => invoice.id))
  return {
    today,
    todayJobs: jobs.filter(job => job.serviceDate === today),
    overdue,
    unpaid: invoices.filter(invoice => invoice.status !== 'paid' && !overdueIds.has(invoice.id)),
  }
}

export function isOverdueInvoice(invoice: Invoice, today = businessDate()) {
  return invoice.status !== 'paid' && (invoice.status === 'overdue' || invoice.dueDate < today)
}
