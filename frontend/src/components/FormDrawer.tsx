import { translate as t, useLanguage } from '../i18n'
import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './FormDrawer.css'

export function FormDrawer({ title, busy, onClose, children }: {
  title: string
  busy: boolean
  onClose: () => void
  children: ReactNode
}) {
  useLanguage()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    const paddingRight = document.body.style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      trigger?.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <dialog ref={dialogRef} className="form-drawer" aria-labelledby="form-drawer-title" onCancel={(event) => {
      event.preventDefault()
      if (!busy) onClose()
    }}>
      <header className="form-drawer-header">
        <div><h2 id="form-drawer-title" tabIndex={-1} autoFocus>{t(title)}</h2><p>{t("带 * 的项目为必填")}</p></div>
        <button type="button" className="text-button" aria-label={t("关闭表单")} disabled={busy} onClick={onClose}>✕</button>
      </header>
      {children}
    </dialog>, document.body,
  )
}
