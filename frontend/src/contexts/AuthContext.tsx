import { type ReactNode } from 'react'
import { getCurrentUser, login as requestLogin, logout as requestLogout, type AuthUser } from '../services/authApi'
import { AuthStateContext } from './authStateContext'
import { useResource } from '../hooks/useResource'

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useResource(getCurrentUser, null as AuthUser | null)
  async function login(email: string, password: string) { session.setData(await requestLogin(email, password)) }
  async function logout() { await requestLogout(); session.setData(null) }
  return <AuthStateContext.Provider value={{ user: session.data, loading: session.isLoading && !session.loaded, login, logout, reauthenticate: () => session.setData(null), session }}>{children}</AuthStateContext.Provider>
}
