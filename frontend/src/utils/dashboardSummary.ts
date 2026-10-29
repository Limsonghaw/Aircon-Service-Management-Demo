import type { CustomerJob } from '../services/customersApi'
import type { Invoice } from '../services/invoicesApi'

export function dashboardMonth(now: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit',
  }).formatToParts(now)
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}

export function dashboardSummary(jobs: CustomerJob[], invoices: Invoice[], now = new Date()) {
  const month = dashboardMonth(now)
  return {
    activeJobs: jobs.filter(job => job.status !== 'completed'),
    inProgress: jobs.filter(job => job.status === 'in_progress').length,
    completedThisMonth: jobs.filter(job => job.status === 'completed' && job.serviceDate.startsWith(`${month}-`)).length,
    // The current schema records paid status, not individual payments or payment dates.
    collected: invoices.filter(invoice => invoice.status === 'paid')
      .reduce((cents, invoice) => cents + Math.round(invoice.amount * 100), 0) / 100,
  }
}
