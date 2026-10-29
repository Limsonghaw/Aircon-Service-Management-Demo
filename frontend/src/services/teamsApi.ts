import { ApiValidationError } from './ApiValidationError'
export type Employee = {
  id: string; teamId: string | null; name: string; phone: string | null; role: string
  notes: string | null; isActive: boolean; createdAt: string; updatedAt: string
}
export type Team = {
  id: string; name: string; notes: string | null; isActive: boolean; employees: Employee[]
  createdAt: string; updatedAt: string
}
export type TeamInput = Pick<Team, 'name' | 'notes' | 'isActive'>
export type EmployeeInput = Pick<Employee, 'teamId' | 'name' | 'phone' | 'role' | 'notes' | 'isActive'>

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) {
    let message = '团队资料请求失败，请稍后重试。'
    try {
      const problem = await response.json() as { detail?: string; errors?: Record<string, string[]> }
      message = problem.detail ?? (Object.values(problem.errors ?? {}).flat().join(' ') || message)
    } catch { /* Keep fallback message for non-JSON errors. */ }
    throw new ApiValidationError(message, {}, response.status)
  }
  return response.json() as Promise<T>
}

export const getTeams = () => request<Team[]>('/api/teams')
export const createTeam = (input: TeamInput) => request<Team>('/api/teams', { method: 'POST', body: JSON.stringify(input) })
export const updateTeam = (id: string, input: TeamInput) => request<Team>(`/api/teams/${id}`, { method: 'PUT', body: JSON.stringify(input) })
export const createEmployee = (teamId: string, input: EmployeeInput) => request<Employee>(`/api/teams/${teamId}/employees`, { method: 'POST', body: JSON.stringify(input) })
export const updateEmployee = (id: string, input: EmployeeInput) => request<Employee>(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(input) })
