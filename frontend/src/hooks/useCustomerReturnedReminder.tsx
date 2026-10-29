import { translate as t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { CustomerReturnedDocuments } from '../components/CustomerReturnedDocuments'
import { useInteraction } from '../contexts/InteractionContext'

type RecordState = { id: string; status: string }
type Target = { kind: 'quote' | 'invoice'; id: string; number: string }

export function useCustomerReturnedReminder() {
  const [target, setTarget] = useState<Target | null>(null)
  const [busy, setBusy] = useState(false)
  const interaction = useInteraction()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (target) { heading.current?.closest('section')?.scrollIntoView({ block: 'start' }); heading.current?.focus({ preventScroll: true }) }
  }, [target])
  function afterSaved(kind: Target['kind'], before: RecordState | undefined, saved: RecordState, number: string) {
    if (before && before.id === saved.id && before.status !== saved.status
      && saved.status === (kind === 'quote' ? 'accepted' : 'paid')) setTarget({ kind, id: saved.id, number })
  }
  function close() { interaction.leave(() => setTarget(null)) }
  const panel = target && <section className="invoice-form-panel" aria-label={t("状态变更后的签回文件")} style={{ scrollMarginTop: 80 }}>
    <div className="customer-form-heading"><h2 ref={heading} tabIndex={-1}>{target.number} · {t(target.kind === 'quote' ? '已接受' : '已付款')}</h2>
      <button type="button" className="text-button" disabled={busy} onClick={close}>{t("关闭提醒")}</button></div>
    <p>{t("状态已由接口确认保存。签回文件为可选附件，以后仍可补传。")}</p>
    <CustomerReturnedDocuments key={`${target.kind}:${target.id}`} kind={target.kind} documentId={target.id}
      reminder onSkip={close} onBusy={setBusy} />
  </section>
  return { afterSaved, panel, active: !!target }
}
