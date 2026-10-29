import { translate as t, useLanguage } from '../i18n'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useBlocker, useLocation } from 'react-router-dom'
import { InteractionContext, type Draft, type Notice } from '../contexts/InteractionContext'
import './Interaction.css'
import { isListDisplayChange } from '../utils/listReturn'

type Confirmation = { title: string; text: string; accept: string; acceptAction: () => void; cancelAction: () => void }
export function InteractionProvider({ children }: { children: ReactNode }) {
  useLanguage()
  const drafts = useRef(new Set<Draft>())
  const [noticeRecord, setNotice] = useState<(Notice & { path: string }) | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const noticeElement = useRef<HTMLDivElement>(null)
  const [noticeHost, setNoticeHost] = useState<HTMLElement>(() => document.body)
  const confirmationRef = useRef<Confirmation | null>(null)
  const location = useLocation()
  const notice = noticeRecord?.path === location.pathname ? noticeRecord : null
  const hasDraft = useCallback(() => [...drafts.current].some(draft => draft.dirty() || draft.busy()), [])
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) =>
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
      && !isListDisplayChange(currentLocation, nextLocation) && hasDraft(), [hasDraft]))
  const register = useCallback((draft: Draft) => { drafts.current.add(draft); return () => { drafts.current.delete(draft) } }, [])
  const notify = useCallback((value: Notice) => setNotice({ ...value, path: location.pathname }), [location.pathname])
  const discard = () => drafts.current.forEach(draft => draft.discard ? draft.discard() : draft.clean())
  function leave(action: () => void) {
    if (!hasDraft()) { action(); return }
    const busy = [...drafts.current].some(draft => draft.busy())
    if (busy) { notify({ kind: 'pending', text: '操作进行中，请等待结果后再离开。' }); return }
    setConfirmation({ title: '有未保存的修改', text: '离开后，尚未保存的内容会丢失。', accept: '放弃修改',
      acceptAction: () => { discard(); action() }, cancelAction: () => {} })
  }
  function confirm(title: string, text: string, accept: string) {
    return new Promise<boolean>(resolve => setConfirmation({ title, text, accept,
      acceptAction: () => resolve(true), cancelAction: () => resolve(false) }))
  }
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasDraft()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [hasDraft])
  useEffect(() => {
    // A popover outside a native modal is inert. Keep retry controls in that modal.
    const updateHost = () => setNoticeHost(document.querySelector<HTMLDialogElement>('.attachment-preview-dialog[open], .form-drawer[open]') ?? document.body)
    const observer = new MutationObserver(updateHost)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
    queueMicrotask(updateHost)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const element = noticeElement.current
    // Closing a drawer detaches its portal host before the observer moves it.
    if (notice && element?.isConnected) element.showPopover()
  }, [notice, noticeHost])
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if ([...drafts.current].some(draft => draft.busy())) {
      notify({ kind: 'pending', text: '操作进行中，请等待结果后再离开。' }); blocker.reset(); return
    }
    setConfirmation({ title: '有未保存的修改', text: '离开后，尚未保存的内容会丢失。', accept: '放弃修改',
      acceptAction: () => { discard(); blocker.proceed() }, cancelAction: () => blocker.reset() })
  }, [blocker, notify])
  useEffect(() => {
    confirmationRef.current = confirmation
    if (!confirmation) return
    const element = dialog.current!
    const previous = document.activeElement as HTMLElement | null
    element.showModal()
    return () => { element.close(); previous?.focus({ preventScroll: true }) }
  }, [confirmation])
  function dismiss(accept: boolean) {
    const current = confirmationRef.current
    setConfirmation(null)
    if (accept) current?.acceptAction(); else current?.cancelAction()
  }
  return <InteractionContext.Provider value={{ register, leave, confirm, notify }}>
    {children}
    {notice && createPortal(<div ref={noticeElement} popover="manual" className={`operation-notice is-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true">{notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '!' : '◌'}</span>
      <div>{t(notice.text)}</div>
      {notice.retry && <button type="button" onClick={notice.retry}>{t(notice.actionLabel ?? '重试')}</button>}
      {notice.kind !== 'pending' && <button type="button" aria-label={t("关闭提示")} onClick={() => setNotice(null)}>×</button>}
    </div>, noticeHost)}
    {confirmation && createPortal(<dialog ref={dialog} className="interaction-dialog" aria-labelledby="interaction-title" aria-describedby="interaction-description" onCancel={event => { event.preventDefault(); dismiss(false) }}>
      <h2 id="interaction-title">{t(confirmation.title)}</h2><p id="interaction-description">{t(confirmation.text)}</p>
      <div className="interaction-dialog-actions"><button autoFocus type="button" className="secondary-button" onClick={() => dismiss(false)}>{t(confirmation.accept === '放弃修改' ? '继续编辑' : '取消')}</button>
        <button type="button" className="primary-button" onClick={() => dismiss(true)}>{t(confirmation.accept)}</button></div>
    </dialog>, document.body)}
  </InteractionContext.Provider>
}
