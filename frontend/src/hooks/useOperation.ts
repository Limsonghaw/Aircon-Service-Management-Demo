import { useRef, useState } from 'react'
import { useInteraction } from '../contexts/InteractionContext'
import { ApiValidationError } from '../services/ApiValidationError'
import { OperationLock } from '../utils/operationLock'
import { useAuth } from '../contexts/useAuth'

// A ref locks synchronously, before React has rendered the disabled controls.
export function useOperation() {
  const lock = useRef(new OperationLock())
  const [busy, setBusy] = useState(false)
  const interaction = useInteraction()
  const { reauthenticate } = useAuth()
  async function run<T>(pending: string, success: string, request: () => Promise<T>, apply: (result: T) => void, retry?: () => void) {
    if (!lock.current.acquire()) return
    setBusy(true)
    const unregister = interaction.register({ dirty: () => false, busy: () => true, clean: () => {} })
    interaction.notify({ kind: 'pending', text: pending })
    try {
      const result = await request()
      apply(result)
      interaction.notify({ kind: 'success', text: success })
      return result
    } catch (error) {
      if (error instanceof ApiValidationError) {
        document.querySelector('form[aria-busy="true"]')?.dispatchEvent(new CustomEvent('api-validation', { detail: error.fields }))
      }
      interaction.notify({ kind: 'error', text: error instanceof Error ? error.message : '操作失败，请重试。',
        actionLabel: error instanceof ApiValidationError && error.status === 401 ? '重新登录' : undefined,
        retry: error instanceof ApiValidationError && error.status === 401 ? () => interaction.leave(reauthenticate) : retry ?? (() => { void run(pending, success, request, apply).catch(() => {}) }) })
      throw error
    } finally { unregister(); lock.current.release(); setBusy(false) }
  }
  return { busy, run }
}
