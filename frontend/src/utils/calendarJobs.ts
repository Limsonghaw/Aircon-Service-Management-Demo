import type { CustomerJob } from '../services/customersApi'

// Calendar dates are civil service dates, never timestamps or creation dates.
export function calendarDays(month: string) {
  const [year, number] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, number - 1, 1))
  const offset = (first.getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, number - 1, 1 - offset + index))
    return date.toISOString().slice(0, 10)
  })
}

export function shiftCalendarMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7)
}

export function calendarJobGroups(jobs: CustomerJob[], team = '', status = '') {
  const groups = new Map<string, CustomerJob[]>()
  for (const job of jobs) {
    if ((team && job.team !== team) || (status && job.status !== status)) continue
    const list = groups.get(job.serviceDate) ?? []
    list.push(job)
    groups.set(job.serviceDate, list)
  }
  return groups
}

export function calendarDateLabel(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return `${year}年${month}月${day}日`
}
