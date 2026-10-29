// Fictional portfolio demo data. No real customer records.
export type JobStatus = '待安排' | '已安排' | '进行中' | '已完成'

export type Job = {
  id: string
  customer: string
  title: string
  serviceDate: string
  team: string
  status: JobStatus
}

export const jobs: Job[] = [
  {
    id: 'JOB-2026-042',
    customer: 'Demo Customer A',
    title: '住宅冷气安装',
    serviceDate: '2026-09-24',
    team: 'Team A',
    status: '已安排',
  },
  {
    id: 'JOB-2026-041',
    customer: 'Demo Customer B',
    title: '冷气维修',
    serviceDate: '2026-09-25',
    team: '未安排',
    status: '待安排',
  },
  {
    id: 'JOB-2026-040',
    customer: 'Demo Office C',
    title: '定期保养',
    serviceDate: '2026-09-26',
    team: 'Team B',
    status: '进行中',
  },
  {
    id: 'JOB-2026-039',
    customer: 'Demo Customer D',
    title: '冷气清洗',
    serviceDate: '2026-09-20',
    team: 'Team A',
    status: '已完成',
  },
]
