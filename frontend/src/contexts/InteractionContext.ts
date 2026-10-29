import { createContext, useContext } from 'react'

export type Draft = { dirty: () => boolean; busy: () => boolean; clean: () => void; discard?: () => void }
export type Notice = { kind: 'pending' | 'success' | 'error'; text: string; retry?: () => void; actionLabel?: string }
export type Interaction = {
  register: (draft: Draft) => () => void
  leave: (action: () => void) => void
  confirm: (title: string, text: string, accept: string) => Promise<boolean>
  notify: (notice: Notice) => void
}
export const InteractionContext = createContext<Interaction | null>(null)
export function useInteraction() {
  const context = useContext(InteractionContext)
  if (!context) throw new Error('InteractionProvider is required')
  return context
}
