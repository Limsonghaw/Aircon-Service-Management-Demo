import { useLayoutEffect, useRef } from 'react'
import { useInteraction } from '../contexts/InteractionContext'

export function useUnsaved<T>(value: T, active: boolean, busy = false, resetKey: unknown = '', onDiscard?: (initial: T) => void) {
  const { register, leave } = useInteraction()
  const current = useRef({ value: '', busy: false, model: value })
  const baseline = useRef('')
  const original = useRef(value)
  const discard = useRef(onDiscard)
  const serialized = JSON.stringify(value)
  useLayoutEffect(() => { current.current = { value: serialized, busy, model: value }; discard.current = onDiscard }, [serialized, busy, value, onDiscard])
  useLayoutEffect(() => {
    if (!active) return
    baseline.current = current.current.value
    original.current = current.current.model
    return register({ dirty: () => current.current.value !== baseline.current,
      busy: () => current.current.busy, clean: () => { baseline.current = current.current.value },
      discard: () => { current.current.value = baseline.current; discard.current?.(original.current) } })
  }, [active, resetKey, register])
  return { leave, clean: () => { baseline.current = current.current.value } }
}
