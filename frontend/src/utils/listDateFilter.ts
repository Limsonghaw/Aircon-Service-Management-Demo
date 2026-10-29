export const dateOptions = { today: '今天', week: '近 7 天', month: '本月', lastMonth: '上月' }
import { businessDate } from './dashboardTasks.ts'

export function matchesListDate(date: string, range: string, today = businessDate()) {
  if (!range) return true
  const value = date.slice(0, 10)
  if (range === 'today') return value === today
  if (range === 'month') return value.slice(0, 7) === today.slice(0, 7)
  const reference = new Date(`${today}T00:00:00Z`)
  if (range === 'lastMonth') {
    reference.setUTCDate(1)
    reference.setUTCMonth(reference.getUTCMonth() - 1)
    return value.slice(0, 7) === reference.toISOString().slice(0, 7)
  }
  if (range === 'week') {
    reference.setUTCDate(reference.getUTCDate() - 6)
    return value >= reference.toISOString().slice(0, 10) && value <= today
  }
  return true
}

