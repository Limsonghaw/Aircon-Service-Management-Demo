export type ActivityLog = {
  id: number
  action: 'created' | 'updated' | 'status_changed' | 'quote_converted' | 'document_signed' | 'receipt_uploaded' | 'job_photo_uploaded'
  entityType: 'customer' | 'job' | 'invoice' | 'quote' | 'expense' | 'team' | 'employee' | 'owner_signature'
  entityId: string
  entityLabel: string
  actorUserId: string | null
  actorName: string
  previousStatus: string | null
  newStatus: string | null
  createdAt: string
}

export async function getActivityLogs(limit = 100): Promise<ActivityLog[]> {
  const response = await fetch(`/api/activity-logs?limit=${limit}`)
  if (!response.ok) throw new Error('无法载入操作日志，请稍后重试。')
  return response.json() as Promise<ActivityLog[]>
}

export type ActivityLogPage = { items: ActivityLog[]; total: number; page: number; pageSize: number }
export async function getActivityLogPage(params: URLSearchParams, signal?: AbortSignal): Promise<ActivityLogPage> {
  const response = await fetch('/api/activity-logs/page?' + params.toString(), { signal })
  if (!response.ok) throw new Error('无法载入操作日志，请稍后重试。')
  return response.json() as Promise<ActivityLogPage>
}
