import { translate as t, useLanguage, getLocale } from '../i18n'
import { useUnsaved } from '../hooks/useUnsaved'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import type { Customer } from '../services/customersApi'
import type { Invoice } from '../services/invoicesApi'
import type { Quote } from '../services/quotesApi'
import { getMySignature, getSigningContext, matchesPreview, saveMySignature, signDocument, signedPdfUrl, type DocumentKind, type PrintFields, type SavedSignatureContext, type SignaturePoint, type SigningContext } from '../services/documentsApi'
import { SignaturePad } from './SignaturePad'

type Props = { kind: DocumentKind; record: Quote | Invoice; customer: Customer; fields: PrintFields; onBusy: (busy: boolean) => void }
export function DocumentSigning({ kind, record, customer, fields, onBusy }: Props) {
  useLanguage()
  const { user } = useAuth()
  const [context, setContext] = useState<SigningContext | null>(null)
  const [error, setError] = useState('')
  const [strokes, setStrokes] = useState<SignaturePoint[][]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedFields, setConfirmedFields] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [savedSignature, setSavedSignature] = useState<SavedSignatureContext | null>(null)
  const [signatureError, setSignatureError] = useState('')
  const [signatureLoading, setSignatureLoading] = useState(true)
  const [savingSignature, setSavingSignature] = useState(false)
  const [notice, setNotice] = useState('')
  const draft = useUnsaved({ strokes, confirmed }, open || busy, busy, record.id, initial => { setStrokes(initial.strokes); setConfirmed(initial.confirmed) })
  useEffect(() => {
    let cancelled = false
    void getSigningContext(kind, record.id).then(result => { if (!cancelled) setContext(result) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : '签名资料载入失败。') })
    return () => { cancelled = true }
  }, [kind, record.id])
  useEffect(() => {
    if (user?.role !== 'owner') return
    let cancelled = false
    void getMySignature().then(result => { if (!cancelled) setSavedSignature(result) })
      .catch(e => { if (!cancelled) setSignatureError(e instanceof Error ? e.message : '常用签名载入失败。') })
      .finally(() => { if (!cancelled) setSignatureLoading(false) })
    return () => { cancelled = true }
  }, [user?.id, user?.role])
  const current = context?.history[0]
  const matches = context ? matchesPreview(context, kind, record, customer) : false
  const isConfirmed = confirmed && confirmedFields === JSON.stringify(fields)
  const hasStrokes = strokes.some(s => s.length >= 2)
  async function reloadSignature() {
    if (busy || signatureLoading) return
    setSignatureLoading(true); setSignatureError(''); setNotice('')
    try { setSavedSignature(await getMySignature()) }
    catch (e) { setSignatureError(e instanceof Error ? e.message : '常用签名载入失败。') }
    finally { setSignatureLoading(false) }
  }
  function useSavedSignature() {
    if (!savedSignature?.signature || busy || signatureLoading || signatureError) return
    setStrokes(savedSignature.signature.strokes.map(stroke => stroke.map(point => ({ ...point }))))
    setConfirmed(false); setNotice('已载入常用签名，请确认当前单据后保存 PDF。')
  }
  async function rememberSignature() {
    if (busy || !hasStrokes || !savedSignature || signatureLoading || signatureError) return
    setBusy(true); setSavingSignature(true); onBusy(true); setSignatureError(''); setNotice('')
    try {
      const result = await saveMySignature(strokes, savedSignature.signature?.id ?? null)
      setSavedSignature({ signature: result }); setConfirmed(false)
      setNotice('已保存我的常用签名。以后可载入使用；当前单据仍需确认并保存 PDF。')
    } catch (e) { setSignatureError(e instanceof Error ? e.message : '常用签名保存失败。') }
    finally { setBusy(false); setSavingSignature(false); onBusy(false) }
  }
  async function save() {
    if (!context || busy || !isConfirmed || !matches) return
    setBusy(true); onBusy(true); setError(''); setNotice('')
    try {
      const result = await signDocument(kind, record.id, context.version, fields, strokes)
      setContext({ ...context, history: [result, ...context.history] })
      setStrokes([]); setConfirmed(false); setOpen(false)
      setNotice('老板签名版 PDF 已生成并保存，请点击「下载老板签名版 PDF」。')
    } catch (e) { setError(e instanceof Error ? e.message : '签名保存失败。') }
    finally { setBusy(false); onBusy(false) }
  }
  return <section className="document-signing" aria-label={t("老板签名版 PDF")}>
    <strong>{t("老板签名版 PDF")}</strong>
    <p>{t("签名版保留签署时的单据内容与老板笔迹。保存常用签名只保存笔迹；当前单据须另行确认并生成签名版 PDF。")}</p>
    {!context && !error && <p>{t("正在载入签名记录…")}</p>}
    {context && !matches && <p role="alert">{t("当前预览与数据库资料不同，请关闭后刷新单据，再重新打开预览。")}</p>}
    {user?.role === 'owner' && <button type="button" className="secondary-button" disabled={!context || !matches || busy || !fields.date}
      onClick={() => draft.leave(() => setOpen(!open))}>{t(open ? '收起签名画板' : current?.isCurrent ? '重新签名' : '手写签名')}</button>}
    {open && user?.role === 'owner' && <>
      <div className="saved-signature-actions">
        <button type="button" className="secondary-button" disabled={busy || signatureLoading || !!signatureError || !savedSignature?.signature}
          onClick={useSavedSignature}>{t("使用已保存签名")}</button>
        <button type="button" className="secondary-button" disabled={busy || signatureLoading || !!signatureError || !savedSignature || !hasStrokes}
          onClick={() => void rememberSignature()}>{t(savingSignature ? '正在保存常用签名…' : savedSignature?.signature ? '替换常用签名（不生成 PDF）' : '保存常用签名（不生成 PDF）')}</button>
        <button type="button" className="secondary-button" disabled={busy || signatureLoading}
          onClick={() => void reloadSignature()}>{t("重新载入常用签名")}</button>
      </div>
      <p>{t(signatureLoading ? '正在载入常用签名…' : savedSignature?.signature
        ? `常用签名保存于 ${new Date(savedSignature.signature.updatedAt).toLocaleString(getLocale())}，仅供你的账号使用。`
        : '你还没有保存常用签名。手写后可选择保存，供以后使用。')}</p>
      {signatureError && <p role="alert">{t(signatureError)}</p>}
      <SignaturePad strokes={strokes} onChange={value => { setStrokes(value); setConfirmed(false); setNotice('') }} disabled={busy} />
      <label className="signature-confirm"><input type="checkbox" checked={isConfirmed} disabled={busy} onChange={e => { setConfirmed(e.target.checked); setConfirmedFields(JSON.stringify(fields)) }} />{t("我确认将此签名放在公司签名栏，并保存当前单据及打印字段。")}</label>
      <button type="button" className="primary-button" disabled={busy || !isConfirmed || !hasStrokes || !fields.date || !matches} onClick={() => void save()}>{t(busy && !savingSignature ? '正在生成并保存 PDF…' : '确认并生成老板签名版 PDF')}</button>
    </>}
    {notice && <p role="status">{t(notice)}</p>}
    {error && <p role="alert">{t(error)}</p>}
    {context?.history.map((entry, index) => <div className="signed-document-row" key={entry.id}>
      <span>{t(index === 0 && entry.isCurrent ? '当前资料签名版' : '历史签名版')} · {entry.signerName} · {new Date(entry.signedAt).toLocaleString(getLocale())}</span>
      <a className="secondary-button" href={signedPdfUrl(kind, record.id, entry.id)} download>{t("下载老板签名版 PDF")}</a>
    </div>)}
    {context?.history.length === 0 && <p>{t(user?.role === 'owner'
      ? '尚未生成老板签名版 PDF。请点击「手写签名」，手写或载入常用签名，确认生成后才会显示下载按钮。'
      : '此报价／发票尚未生成老板签名版 PDF，因此暂时没有下载按钮。只有老板账号可签署，请老板登录后生成；管理员可下载已生成的签名版。')}</p>}
  </section>
}
