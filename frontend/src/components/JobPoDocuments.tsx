import { translate as t, useLanguage } from '../i18n'
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { AttachmentGallery, PendingAttachment, AttachmentUploadProgress } from './Attachments'
import { DataState, LoadState } from './DataState'
import { useResource } from '../hooks/useResource'
import { useOperation } from '../hooks/useOperation'
import { useUnsaved } from '../hooks/useUnsaved'
import { createPoUploadId, getJobPoDocuments, jobPoDocumentUrl, poMaxBytes, uploadJobPoDocument, type JobPoDocument } from '../services/jobPoDocumentsApi'
import type { AttachmentProgress } from '../services/attachmentUpload'
import './JobPoDocuments.css'

export function JobPoDocuments({ jobId, blocked, onBusy }: { jobId: string; blocked: boolean; onBusy: (busy: boolean) => void }) {
  useLanguage()
  const load = useCallback(() => getJobPoDocuments(jobId), [jobId])
  const resource = useResource(load, [] as JobPoDocument[])
  const [pending, setPending] = useState<{ id: string; file: File } | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<AttachmentProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const uploading = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const operation = useOperation()
  useUnsaved(pending ? { id: pending.id, name: pending.file.name, size: pending.file.size } : null, true, busy, jobId,
    () => { setPending(null); if (input.current) input.current.value = '' })
  const disabled = busy || blocked || resource.isLoading || !resource.available || !!resource.error

  function selectFile(file: File | null) {
    if (!file || uploading.current || blocked) return
    setError(''); setNotice('')
    if (!file.size) setError('PO PDF 不能为空。')
    else if (file.size > poMaxBytes) setError('PO PDF 不能超过 10 MB。')
    else if (!/\.pdf$/i.test(file.name)) setError('PO 附件只支持 PDF。')
    else if (file.name.length > 200) setError('文件名不能超过 200 个字符。')
    else setPending({ id: createPoUploadId(), file })
  }
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!pending || disabled || uploading.current || operation.busy) return
    uploading.current = true
    setBusy(true); onBusy(true); setError(''); setNotice('')
    try {
      await operation.run('正在上传 PO PDF…', 'PO PDF 已保存',
        () => uploadJobPoDocument(jobId, pending.id, pending.file, setProgress), saved => {
          resource.setData(current => [saved, ...current.filter(item => item.id !== saved.id)])
          setPending(null)
          if (input.current) input.current.value = ''
          setNotice('PO PDF 已上传并保存，历史文件已保留。')
        }, () => form.current?.requestSubmit())
    } catch (failure) {
      resource.blockAccess(failure)
      setError(failure instanceof Error ? failure.message : 'PO PDF 上传失败，请重试。')
    } finally {
      uploading.current = false; setBusy(false); setProgress(null); onBusy(false)
    }
  }
  return <section className="invoice-form-panel job-po-documents" aria-labelledby="job-po-title">
    <h2 id="job-po-title">{t("PO（采购订单）PDF")}</h2>
    <p>{t("可选附件，每份 PDF 最多 10 MB。不上传也可建立、安排及完成工作单，之后可补传；每次上传保留历史文件。")}</p>
    <LoadState state={resource} label="PO PDF" />
    {!resource.restricted && <form ref={form} className="job-po-controls" aria-busy={busy} onSubmit={event => void upload(event)}>
      <input ref={input} type="file" hidden accept=".pdf,application/pdf" aria-label={t("选择 PO PDF 文件")} disabled={disabled}
        onChange={event => selectFile(event.target.files?.[0] ?? null)} />
      <button className="secondary-button" type="button" disabled={disabled} onClick={() => { if (input.current) { input.current.value = ''; input.current.click() } }}>{t("选择 PDF")}</button>
      <button className="primary-button" type="submit" disabled={disabled || !pending}>{t(busy ? '上传中…' : '上传 PO PDF')}</button>
      <button className="secondary-button" type="button" disabled={busy || blocked || resource.isLoading} onClick={() => { setNotice(''); resource.retry() }}>{t("刷新 PO 文件")}</button>
    </form>}
    {pending && <ul className="attachment-pending-list" aria-label={t("待上传 PO PDF")}>
      <PendingAttachment file={pending.file} busy={busy || blocked} onRemove={() => { setPending(null); setError(''); if (input.current) input.current.value = '' }} />
    </ul>}
    <AttachmentUploadProgress progress={progress} label={t("正在上传 PO PDF")} />
    {error && <div className="attachment-retry"><p className="customer-error" role="alert">{t(error)}</p>
      {pending && <p>{t("已选文件仍保留。重试同一文件会核对保存结果，不会覆盖历史文件。")}</p>}
      {pending && !resource.restricted && <button className="secondary-button" type="button" disabled={disabled} onClick={() => form.current?.requestSubmit()}>{t("重试上传 PO PDF")}</button>}
    </div>}
    {notice && <p className="customer-success" role="status">{t(notice)}</p>}
    {resource.available && !resource.data.length && <DataState title={t("尚未上传 PO PDF")} description={t("没有 PO 不影响工作流程，需要时可在这里补传。")} />}
    {resource.available && resource.data.length > 0 && <AttachmentGallery items={resource.data} label="PO PDF"
      url={item => jobPoDocumentUrl(jobId, item.id)} downloadUrl={item => jobPoDocumentUrl(jobId, item.id, true)} />}
  </section>
}
