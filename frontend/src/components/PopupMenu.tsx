import { translate as t, useLanguage } from '../i18n'
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './PopupMenu.css'

type Item = { label: string; onSelect: () => void; icon?: ReactNode; selected?: boolean; disabled?: boolean; danger?: boolean; className?: string }

export function PopupMenu({ label, children, items, className = '', disabled = false, align = 'start' }: {
  label: string; children: ReactNode; items: Item[]; className?: string; disabled?: boolean; align?: 'start' | 'end'
}) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const firstFocus = useRef<'selected' | 'last'>('selected')
  const search = useRef({ value: '', time: 0 })
  const id = useId()
  function close(restoreFocus = true) {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return
    const rect = trigger.current.getBoundingClientRect()
    const width = menu.current.getBoundingClientRect().width
    const height = Math.min(menu.current.scrollHeight, 360)
    const below = window.innerHeight - rect.bottom - 14
    const above = rect.top - 14
    const downward = below >= height || below >= above
    const maxHeight = Math.max(44, Math.min(360, downward ? below : above))
    setPosition({ left: Math.max(8, Math.min(align === 'end' ? rect.right - width : rect.left, window.innerWidth - width - 8)),
      top: downward ? Math.max(8, rect.bottom + 6) : Math.max(8, rect.top - Math.min(height, maxHeight) - 6), maxHeight })
  }, [open, align])
  useLayoutEffect(() => {
    if (!position || !menu.current) return
    const buttons = Array.from(menu.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const selected = menu.current.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)')
    const target = firstFocus.current === 'last' ? buttons.at(-1) : selected ?? buttons[0]
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'nearest' })
  }, [position])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false)
    }
    const dismiss = (event: Event) => { if (!menu.current?.contains(event.target as Node)) close(false) }
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])
  return <>
    <button ref={trigger} className={className} type="button" disabled={disabled} aria-label={t(label)} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) close(); else { firstFocus.current = 'selected'; setOpen(true) } }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); firstFocus.current = event.key === 'ArrowUp' ? 'last' : 'selected'; setOpen(true) } }}>
      {children}
    </button>
    {open && !disabled && createPortal(<div ref={menu} id={id} className="app-popup-menu" role="menu" aria-label={t(label)}
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }} onKeyDown={event => {
        const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        let next: number | undefined
        if (event.key === 'Escape') { event.preventDefault(); close() }
        else if (event.key === 'Tab') close()
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = buttons.length - 1
        else if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
        else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
        else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey) {
          search.current = { value: Date.now() - search.current.time < 700 ? search.current.value + event.key : event.key, time: Date.now() }
          next = buttons.findIndex(button => button.dataset.menuLabel?.toLocaleLowerCase().startsWith(search.current.value.toLocaleLowerCase()))
        }
        if (next !== undefined && next >= 0) { event.preventDefault(); buttons[next]?.focus({ preventScroll: true }); buttons[next]?.scrollIntoView({ block: 'nearest' }) }
      }}>
      {items.map((item, index) => <button key={index} type="button" role={item.selected === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.selected} disabled={item.disabled} data-menu-label={t(item.label)}
        className={`app-menu-item ${item.danger ? 'is-danger' : ''} ${item.className ?? ''}`} onClick={() => { close(); item.onSelect() }}>
        {item.icon && <span className="app-menu-icon" aria-hidden="true">{item.icon}</span>}<span>{t(item.label)}</span>{item.selected && <span className="app-menu-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>, document.body)}
  </>
}

export function MenuSelect({ label, value, options, onChange }: { label: string; value: string; options: Record<string, string>; onChange: (value: string) => void }) {
  useLanguage()
  return <PopupMenu label={t(label)} className="app-select-trigger" items={Object.entries(options).map(([key, text]) => ({ label: text, selected: key === value, onSelect: () => onChange(key) }))}>
    <span>{t(options[value] ?? value)}</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5" /></svg>
  </PopupMenu>
}
