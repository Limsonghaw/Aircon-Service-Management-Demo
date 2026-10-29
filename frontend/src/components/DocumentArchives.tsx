import { translate as t, useLanguage } from '../i18n'
import { useRef, useState, type FormEvent } from 'react'
import { useResource } from '../hooks/useResource'
import { useUnsaved } from '../hooks/useUnsaved'
import { useInteraction } from '../contexts/InteractionContext'
import { LoadState } from './DataState'
import { PendingAttachment } from './Attachments'
import { getCustomers, type Customer } from '../services/customersApi'
import { ApiValidationError } from '../services/ApiValidationError'
import { createReturnedUploadId } from '../services/customerReturnedDocumentsApi'
import { saveDocumentArchive, type ArchiveKind, type DocumentArchive } from '../services/documentArchivesApi'
import { inspectArchivePdf } from '../services/archivePdfText'
import './DocumentArchives.css'

const empty = { customerId: '', originalNumber: '', originalDate: '' }
export function DocumentArchives({ kind, onSaved, onAccessFailure, restricted }: { kind: ArchiveKind; onSaved: (item: DocumentArchive) => void; onAccessFailure: (error: unknown) => void; restricted: boolean }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<{ id: string; file: File } | null>(null)
  const [fields, setFields] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [locked, setLocked] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [recognition, setRecognition] = useState('')
  const running = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const interaction = useInteraction()
  const customers = useResource(getCustomers, [] as Customer[], open)
  const draft = useUnsaved({ fields, fileId: pending?.id }, open, busy, kind, () => {
    setFields(empty); setPending(null); setLocked(false); setError(''); setRecognition('')
  })
  const label = kind === 'quote' ? '报价' : '发票'
  const disabled = busy || restricted || customers.restricted

  async function recognize(file: File) {
    running.current = true; setBusy(true); setRecognition('正在本地读取 PDF 文字…')
    try {
      const result = await inspectArchivePdf(file, kind)
      setFields(current => ({ ...current, originalNumber: current.originalNumber || result.number, originalDate: current.originalDate || result.date }))
      setRecognition(result.message + ((!result.number || !result.date) ? '未明确识别的字段可手填或留空。' : ''))
    } catch {
      setRecognition('识别失败（可能损坏或有密码），文件仍保留。可以重试识别，或手填／留空后保存原件。')
    } finally { running.current = false; setBusy(false) }
  }
  async function select(file?: File) {
    if (!file || running.current || disabled) return
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024 || file.name.length > 200) {
      setError('请选择非空 PDF，最多 10 MB，文件名最多 200 个字符。'); return
    }
    if (pending && !await interaction.confirm('替换所选原件？', '现有编号、日期会保留供你核对。之前未确认的上传可能已保存，可先刷新历史归档检查。', '替换原件')) return
    setPending({ id: createReturnedUploadId(), file }); setLocked(false); setError(''); setNotice('')
    await recognize(file)
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!pending || !fields.customerId || disabled || running.current) return
    running.current = true; setBusy(true); setLocked(true); setError(''); setNotice('')
    const submit = (confirmed: boolean) => saveDocumentArchive(kind, pending.id, pending.file, fields, confirmed)
    try {
      let saved: DocumentArchive
      try { saved = await submit(false) }
      catch (failure) {
        if (!(failure instanceof ApiValidationError) || failure.status !== 422) throw failure
        if (!await interaction.confirm('原编号重复', '同类单据已有此原编号。请核对原件；继续会另存一份历史归档，不覆盖已有记录。', '确认另存')) { setLocked(false); return }
        saved = await submit(true)
      }
      draft.clean(); setPending(null); setFields(empty); setLocked(false); setOpen(false); onSaved(saved)
      setNotice('历史原件已归档，不计入欠款或收入，不改变付款状态。')
    } catch (failure) {
      onAccessFailure(failure)
      setError(failure instanceof Error ? failure.message : '上传失败，请重试。')
    } finally { running.current = false; setBusy(false) }
  }
  return <div className="document-archives" aria-label={t(`上传旧${t(label)}归档`)}>
    <div className="archive-actions">
      <button type="button" className="secondary-button" disabled={busy || open} onClick={() => interaction.leave(() => setOpen(true))}>{t("上传旧单据归档")}</button>
    </div>
    {open && <form className="invoice-form-panel archive-form" onSubmit={event => void save(event)} aria-busy={busy}>
      <div className="customer-form-heading"><h2>{t("上传旧")}{t(label)}{t("归档")}</h2><button type="button" className="text-button" disabled={busy} onClick={() => draft.leave(() => setOpen(false))}>{t("取消")}</button></div>
      <p>{t("只保存历史原件，不计入欠款、收入或状态提醒。无需重填项目，原编号和日期可留空。")}</p>
      <div className="archive-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files.length > 1) setError('请一次选择一份 PDF。'); else void select(event.dataTransfer.files[0]) }}>
        <span>{t("拖入 PDF，或")}</span><button type="button" className="secondary-button" disabled={disabled} onClick={() => { if (input.current) { input.current.value = ''; input.current.click() } }}>{t("选择 PDF")}</button><small>{t("每份最多 10 MB")}</small>
        <input ref={input} type="file" hidden accept=".pdf,application/pdf" aria-label={t("选择历史原件 PDF")} onChange={event => void select(event.target.files?.[0])} />
      </div>
      {pending && <ul className="attachment-pending-list"><PendingAttachment file={pending.file} busy={busy} onRemove={() => { setPending(null); setLocked(false); setRecognition('') }} /></ul>}
      <LoadState state={customers} label={t("客户资料")} />
      <div className="archive-fields">
        <label>{t("所属客户（必填）")}<select required value={fields.customerId} disabled={disabled || locked || !customers.available} onChange={event => setFields({ ...fields, customerId: event.target.value })}><option value="">{t("请选择客户")}</option>{customers.data.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label>{t("原单据编号（选填）")}<input maxLength={50} value={fields.originalNumber} disabled={disabled || locked} onChange={event => setFields({ ...fields, originalNumber: event.target.value })} /></label>
        <label>{t("原单据日期（选填）")}<input type="date" value={fields.originalDate} disabled={disabled || locked} onChange={event => setFields({ ...fields, originalDate: event.target.value })} /></label>
      </div>
      <p className="archive-hint">{t("识别在本机进行，不发送至 OCR／AI 服务。扫描、手写内容请人工核对；导入时间将在保存成功时记录。")}</p>
      {recognition && <p role="status">{t(recognition)}</p>}
      {locked && <p>{t("已发起保存，资料暂时锁定以便安全重试。需要修改时请重新选择文件；先检查历史归档，避免重复导入。")}</p>}
      {error && <p role="alert" className="customer-error">{t(error)}{t(" 已选原件及输入仍保留。")}</p>}
      <div className="archive-actions"><button className="primary-button" type="submit" disabled={disabled || !pending || !fields.customerId || !customers.available}>{t(busy ? '处理中…' : locked ? '重试保存归档' : '保存归档')}</button>
        <button className="secondary-button" type="button" disabled={disabled || !pending || locked} onClick={() => { if (pending) void recognize(pending.file) }}>{t("重试识别")}</button></div>
    </form>}
    {notice && <p role="status" className="customer-success">{t(notice)}</p>}
  </div>
}
