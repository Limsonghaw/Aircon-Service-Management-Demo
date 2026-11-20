import { type ReactNode } from 'react'
import { login as requestLogin, logout as requestLogout } from '../services/authApi'
import { AuthStateContext } from './authStateContext'
import { useColdStartSession } from '../hooks/useColdStartSession'

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useColdStartSession()
  async function login(email: string, password: string) { session.setData(await requestLogin(email, password)) }
  async function logout() { await requestLogout(); session.setData(null) }
  return <AuthStateContext.Provider value={{ user: session.data, loading: session.isLoading && !session.loaded, login, logout, reauthenticate: () => session.setData(null), session }}>{children}</AuthStateContext.Provider>
}
