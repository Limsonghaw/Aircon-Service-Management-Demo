import { translate as t, useLanguage } from '../i18n'
import { useCallback, useId, useRef, useState, type FormEvent } from 'react'
import { AttachmentGallery, PendingAttachment, AttachmentUploadProgress } from './Attachments'
import { DataState, LoadState } from './DataState'
import { useResource } from '../hooks/useResource'
import { useOperation } from '../hooks/useOperation'
import { useUnsaved } from '../hooks/useUnsaved'
import { createReturnedUploadId, getCustomerReturnedDocuments, customerReturnedDocumentUrl, returnedMaxBytes, uploadCustomerReturnedDocument, type CustomerReturnedDocument } from '../services/customerReturnedDocumentsApi'
import type { AttachmentProgress } from '../services/attachmentUpload'
import './CustomerReturnedDocuments.css'

export function CustomerReturnedDocuments({ kind, documentId, blocked = false, onBusy = ignoreBusy, reminder = false, onSkip }: { kind: 'quote' | 'invoice'; documentId: string; blocked?: boolean; onBusy?: (busy: boolean) => void; reminder?: boolean; onSkip?: () => void }) {
  useLanguage()
  const titleId = useId()
  const [uploadChosen, setUploadChosen] = useState(false)
  const load = useCallback(() => getCustomerReturnedDocuments(kind, documentId), [kind, documentId])
  const resource = useResource(load, [] as CustomerReturnedDocument[])
  const [pending, setPending] = useState<{ id: string; file: File } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<AttachmentProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const uploading = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const operation = useOperation()
  useUnsaved(pending ? { id: pending.id, name: pending.file.name, size: pending.file.size } : null, true, busy, documentId,
    () => { setPending(null); if (input.current) input.current.value = '' })
  const disabled = busy || blocked || resource.isLoading || !resource.available || !!resource.error
  const askUpload = reminder && resource.available && resource.data.length === 0 && !uploadChosen

  function selectFile(file: File | null) {
    if (!file || uploading.current || blocked) return
    setError(''); setNotice('')
    if (!file.size) setError('客户签回 PDF 不能为空。')
    else if (file.size > returnedMaxBytes) setError('客户签回 PDF 不能超过 10 MB。')
    else if (!/\.pdf$/i.test(file.name)) setError('客户签回附件只支持 PDF。')
    else if (file.name.length > 200) setError('文件名不能超过 200 个字符。')
    else setPending({ id: createReturnedUploadId(), file })
  }
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!pending || disabled || uploading.current || operation.busy) return
    uploading.current = true
    setBusy(true); onBusy(true); setError(''); setNotice('')
    try {
      await operation.run('正在上传客户签回 PDF…', '客户签回 PDF 已保存',
        () => uploadCustomerReturnedDocument(kind, documentId, pending.id, pending.file, setProgress), saved => {
          resource.setData(current => [saved, ...current.filter(item => item.id !== saved.id)])
          setPending(null)
          if (input.current) input.current.value = ''
          setNotice('客户签回 PDF 已上传并保存，历史文件已保留。')
        }, () => form.current?.requestSubmit())
    } catch (failure) {
      resource.blockAccess(failure)
      setError(failure instanceof Error ? failure.message : '客户签回 PDF 上传失败，请重试。')
    } finally {
      uploading.current = false; setBusy(false); setProgress(null); onBusy(false)
    }
  }
  return <section className="invoice-form-panel customer-returned-documents" aria-labelledby={titleId}>
    <h2 id={titleId}>{t("客户签回 PDF")}</h2>
    <p>{t("可选附件，每份 PDF 最多 10 MB。客户在外部签署后由老板或管理员保存；可随时补传，每次上传保留历史文件。此文件与老板签名版 PDF 分开保存，不改变付款状态。")}</p>
    <LoadState state={resource} label={t("客户签回 PDF")} />
    {askUpload && <div><p>{t("是否上传客户签回的 PDF？")}</p><div className="customer-returned-controls">
      <button className="primary-button" type="button" onClick={() => setUploadChosen(true)}>{t("上传 PDF")}</button>
      <button className="secondary-button" type="button" onClick={onSkip}>{t("暂不上传")}</button>
    </div></div>}
    {reminder && resource.available && resource.data.length > 0 && <p>{t("已有客户签回文件，无需重复上传。可查看现有文件，或按需要补传。")}</p>}
    {!resource.restricted && !askUpload && <form ref={form} className="customer-returned-controls" aria-busy={busy} onSubmit={event => void upload(event)}>
      <input ref={input} type="file" hidden accept=".pdf,application/pdf" aria-label={t("选择客户签回 PDF 文件")} disabled={disabled}
        onChange={event => selectFile(event.target.files?.[0] ?? null)} />
      <button className="secondary-button" type="button" disabled={disabled} onClick={() => { if (input.current) { input.current.value = ''; input.current.click() } }}>{t("选择 PDF")}</button>
      <button className="primary-button" type="submit" disabled={disabled || !pending}>{t(busy ? '上传中…' : '上传客户签回 PDF')}</button>
      <button className="secondary-button" type="button" disabled={busy || blocked || resource.isLoading} onClick={() => { setNotice(''); resource.retry() }}>{t("刷新客户签回文件")}</button>
    </form>}
    {pending && <ul className="attachment-pending-list" aria-label={t("待上传客户签回 PDF")}>
      <PendingAttachment file={pending.file} busy={busy || blocked} onRemove={() => { setPending(null); setError(''); if (input.current) input.current.value = '' }} />
    </ul>}
    <AttachmentUploadProgress progress={progress} label={t("正在上传客户签回 PDF")} />
    {error && <div className="attachment-retry"><p className="customer-error" role="alert">{t(error)}</p>
      {pending && <p>{t("已选文件仍保留。重试同一文件会核对保存结果，不会覆盖历史文件。")}</p>}
      {pending && !resource.restricted && <button className="secondary-button" type="button" disabled={disabled} onClick={() => form.current?.requestSubmit()}>{t("重试上传客户签回 PDF")}</button>}
    </div>}
    {notice && <p className="customer-success" role="status">{t(notice)}</p>}
    {resource.available && !resource.data.length && !askUpload && <DataState title={t("尚未上传客户签回 PDF")} description={t("尚未保存客户签回文件，需要时可补传；不影响单据原有流程。")} />}
    {resource.available && resource.data.length > 0 && <AttachmentGallery items={resource.data} label={t("客户签回 PDF")}
      url={item => customerReturnedDocumentUrl(kind, documentId, item.id)} downloadUrl={item => customerReturnedDocumentUrl(kind, documentId, item.id, true)} />}
  </section>
}

function ignoreBusy() { /* Standalone panels use the shared leave protection. */ }
