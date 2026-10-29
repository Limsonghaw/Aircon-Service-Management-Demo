import { useContext } from 'react'
import { AuthStateContext } from './authStateContext'

export function useAuth() {
  const value = useContext(AuthStateContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}
