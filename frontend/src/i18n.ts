import { useSyncExternalStore } from 'react'
import { english } from './translations'

export type Language = 'zh' | 'en'
const storageKey = 'shengheng.language'
const listeners = new Set<() => void>()
function readPreference(): Language {
  try { return localStorage.getItem(storageKey) === 'en' ? 'en' : 'zh' } catch { return 'zh' }
}
let language: Language = readPreference()
function updateDocument() { document.documentElement.lang = language === 'en' ? 'en' : 'zh-Hans' }
updateDocument()
function receivePreference(event: StorageEvent) {
  if (event.key !== storageKey && event.key !== null) return
  const next = readPreference()
  if (next === language) return
  language = next
  updateDocument()
  listeners.forEach(listener => listener())
}
function subscribe(listener: () => void) {
  if (!listeners.size) window.addEventListener('storage', receivePreference)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) window.removeEventListener('storage', receivePreference)
  }
}
export function setLanguage(next: Language) {
  if (next === language) return
  language = next
  try { localStorage.setItem(storageKey, next) } catch { /* Switching still works with storage disabled. */ }
  updateDocument()
  listeners.forEach(listener => listener())
}
export function useLanguage() { return useSyncExternalStore(subscribe, () => language, () => 'zh' as Language) }
export function getLocale() { return language === 'en' ? 'en-MY' : 'zh-CN' }

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key))
  .sort(([left], [right]) => right.replace(/\{\d+\}/g, '').length - left.replace(/\{\d+\}/g, '').length)
  .map(([key, value]) => ({
  expression: new RegExp('^' + key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '([\\s\\S]*?)' : escapeRegex(part)).join('') + '$'),
  value,
}))

/** Translate display copy only. Callers keep record values, form inputs, API enums and CSS keys unchanged. */
export function translate<T>(value: T): T {
  if (language === 'zh' || typeof value !== 'string') return value
  const copy = value.trim()
  let translated: string | undefined = english[copy]
  if (translated === undefined) {
    for (const pattern of patterns) {
      const match = pattern.expression.exec(copy)
      if (match) {
        translated = pattern.value.replace(/\{(\d+)\}/g, (_, index: string) => match[Number(index) + 1] ?? '')
        break
      }
    }
  }
  return (translated === undefined ? value : value.replace(copy, translated)) as T
}
