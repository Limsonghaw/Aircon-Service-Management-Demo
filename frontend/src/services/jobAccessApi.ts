export type EmployeeAccountLink = { id: string; employeeId: string | null }

export async function getEmployeeAccountLinks(): Promise<EmployeeAccountLink[]> {
  const response = await fetch('/api/user-employee-links')
  if (!response.ok) throw new Error('无法载入员工账号绑定。')
  return response.json() as Promise<EmployeeAccountLink[]>
}

export async function bindEmployeeAccount(id: string, employeeId: string | null) {
  const response = await fetch(`/api/user-employee-links/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeId }),
  })
  if (!response.ok) {
    const problem = await response.json() as { detail?: string }
    throw new Error(problem.detail ?? '无法更新员工账号绑定。')
  }
}
