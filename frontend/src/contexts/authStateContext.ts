import { createContext } from 'react'
import type { AuthUser } from '../services/authApi'
import type { LoadFailure } from '../utils/loadFailure'

export type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reauthenticate: () => void
  session: { isLoading: boolean; loaded: boolean; failure: LoadFailure | null; retry: () => void }
}

export const AuthStateContext = createContext<AuthContextValue | null>(null)
