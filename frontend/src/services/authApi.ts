import { safeApiMessage } from './ApiValidationError'
export type UserRole = 'owner' | 'admin' | 'employee'
export type AuthUser = {
  id: string
  email: string
  displayName: string
  role: UserRole
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const problem = await response.json() as { detail?: string; title?: string }
    return safeApiMessage(problem.detail ?? problem.title ?? fallback, response.status)
  } catch {
    return safeApiMessage(fallback, response.status)
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me')
  if (response.status === 401) return null
  if (!response.ok) throw new Error(await errorMessage(response, '无法确认登录状态。'))
  return response.json() as Promise<AuthUser>
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!response.ok) throw new Error(await errorMessage(response, '登录失败。'))
  return response.json() as Promise<AuthUser>
}

export async function logout() {
  const response = await fetch('/api/auth/logout', { method: 'POST' })
  if (!response.ok) throw new Error(await errorMessage(response, '登出失败。'))
}

export async function getUsers(): Promise<AuthUser[]> {
  const response = await fetch('/api/users')
  if (!response.ok) throw new Error(await errorMessage(response, '无法载入用户。'))
  return response.json() as Promise<AuthUser[]>
}

export async function changeUserRole(id: string, role: UserRole): Promise<AuthUser> {
  const response = await fetch(`/api/users/${encodeURIComponent(id)}/role`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!response.ok) throw new Error(await errorMessage(response, '无法更新用户权限。'))
  return response.json() as Promise<AuthUser>
}
