import { ApiValidationError } from './ApiValidationError'
import { notifyJobsChanged } from './jobChanges'
export type CustomerType = 'individual' | 'business'

export type Customer = {
  id: string
  name: string
  customerType: CustomerType
  phone: string
  email: string | null
  address: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type CustomerInput = Pick<Customer, 'name' | 'customerType' | 'phone' | 'email' | 'address' | 'notes'>

export type CustomerJob = {
  id: string
  jobNumber: string
  customerId: string
  customerName?: string | null
  title: string
  serviceDate: string
  team: string
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed'
  createdAt: string
  updatedAt: string
}

export type CustomerJobInput = Pick<CustomerJob, 'jobNumber' | 'title' | 'serviceDate' | 'team' | 'status'>

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })

  if (!response.ok) {
    let message = '客户资料请求失败，请稍后再试。'
    let fields: Record<string, string[]> = {}
    try {
      const problem = await response.json() as { title?: string; detail?: string; errors?: Record<string, string[]> }
      fields = problem.errors ?? {}
      message = problem.detail ?? (Object.values(fields).flat().join(' ') || problem.title || message)
    } catch {
      // The API may return an empty error response.
    }
    throw new ApiValidationError(message, fields, response.status)
  }

  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}

export const getCustomers = () => request<Customer[]>('/api/customers')

export const getCustomer = (id: string) => request<Customer>(`/api/customers/${id}`)

export const getCustomerJobs = (id: string) => request<CustomerJob[]>(`/api/customers/${id}/jobs`)

export const createCustomerJob = async (customerId: string, input: CustomerJobInput) => {
  const job = await request<CustomerJob>(`/api/customers/${customerId}/jobs`, {
    method: 'POST', body: JSON.stringify(input),
  })
  notifyJobsChanged()
  return job
}

export const getJobs = (signal?: AbortSignal) => request<CustomerJob[]>('/api/jobs', { signal, cache: 'no-store' })

export type JobDetails = { job: CustomerJob; phone: string | null; address: string | null }
export const getJobDetails = (id: string, signal?: AbortSignal) =>
  request<JobDetails>(`/api/jobs/${encodeURIComponent(id)}`, { signal })

export const updateJob = async (id: string, input: CustomerJobInput) => {
  const job = await request<CustomerJob>(`/api/jobs/${id}`, { method: 'PUT', body: JSON.stringify(input) })
  notifyJobsChanged()
  return job
}

export const deleteJob = async (id: string) => {
  await request<void>(`/api/jobs/${id}`, { method: 'DELETE' })
  notifyJobsChanged()
}

export const createCustomer = (input: CustomerInput) => request<Customer>('/api/customers', {
  method: 'POST', body: JSON.stringify(input),
})

export const updateCustomer = (id: string, input: CustomerInput) => request<Customer>(`/api/customers/${id}`, {
  method: 'PUT', body: JSON.stringify(input),
})

export const deleteCustomer = (id: string) => request<void>(`/api/customers/${id}`, { method: 'DELETE' })
