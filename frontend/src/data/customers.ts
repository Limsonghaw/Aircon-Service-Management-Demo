// Fictional portfolio demo data. No real customer records.
export type Customer = {
  id: number
  name: string
  category: string
  phone: string
  latestJob: string
}

export const customers: Customer[] = [
  { id: 1, name: 'Demo Customer A', category: '住宅安装', phone: '000-000-0001', latestJob: '09/24 安装' },
  { id: 2, name: 'Demo Customer B', category: '住宅维修', phone: '000-000-0002', latestJob: '09/25 维修' },
  { id: 3, name: 'Demo Office C', category: '企业客户', phone: '000-000-0003', latestJob: '09/26 保养' },
  { id: 4, name: 'Demo Customer D', category: '住宅清洗', phone: '000-000-0004', latestJob: '09/20 清洗' },
]
