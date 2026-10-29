import { translate as t, useLanguage } from '../i18n'
import { AttachmentGallery, PendingAttachment, AttachmentUploadProgress } from './Attachments'
import type { AttachmentProgress } from '../services/attachmentUpload'
import { DataState, LoadState } from './DataState'
import { useResource } from '../hooks/useResource'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Expense } from '../services/expensesApi'
import { ExpenseReceiptRequestError, expenseReceiptUrl, getExpenseReceipts, receiptMaxBytes, uploadExpenseReceipt, type ExpenseReceipt } from '../services/expenseReceiptsApi'
import './ExpenseReceipts.css'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { useInteraction } from '../contexts/InteractionContext'

type Props = { expense: Expense; onClose: () => void; onBusy: (busy: boolean) => void }
export function ExpenseReceipts({ expense, onClose, onBusy }: Props) {
  useLanguage()
  const [resultChecked, setResultChecked] = useState(false)
  const loadReceipts = useCallback(async () => { const result = await getExpenseReceipts(expense.id); setResultChecked(true); return result }, [expense.id])
  const receiptState = useResource(loadReceipts, [] as ExpenseReceipt[])
  const { data: receipts, setData: setReceipts, isLoading: loading } = receiptState
  const listError = receiptState.error ?? ''
  const [busy, setBusy] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [notice, setNotice] = useState('')
  const [transfer, setTransfer] = useState<AttachmentProgress | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [needsVerification, setNeedsVerification] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null)
  const uploadForm = useRef<HTMLFormElement>(null)
  const uncertainUpload = useRef(false)
  const uploading = useRef(false)
  const operation = useOperation()
  const interaction = useInteraction()
  const draft = useUnsaved(file ? { name: file.name, size: file.size, modified: file.lastModified } : null, true, busy, expense.id, () => { setFile(null); if (input.current) input.current.value = ''; if (camera.current) camera.current.value = '' })
  useEffect(() => { panel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [expense.id])

  function refresh() {
    if (loading || busy) return
    setResultChecked(false); setNotice(''); receiptState.retry()
  }
  function selectFile(selected: File | null) {
    if (!selected) return
    setUploadError(''); setNotice('')
    if (selected.size === 0) setUploadError('收据文件为空。')
    else if (selected.size > receiptMaxBytes) setUploadError('收据文件不能超过 10 MB。')
    else if (!/\.(jpe?g|png|pdf)$/i.test(selected.name)) setUploadError('请选择 JPG、PNG 或 PDF 收据。')
    else if (selected.name.length > 200) setUploadError('收据文件名不能超过 200 个字符。')
    else { setNeedsVerification(false); setFile(selected) }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || uploading.current || busy || operation.busy || loading || listError || needsVerification) return
    uploading.current = true // Prevent a second submit from releasing the first upload's busy controls.
    setBusy(true); onBusy(true); setUploadError(''); setNotice('')
    try {
      await operation.run('正在上传收据…', '收据已上传', async () => {
        uncertainUpload.current = false
        try { return await uploadExpenseReceipt(expense.id, file, setTransfer) }
        catch (error) { uncertainUpload.current = error instanceof ExpenseReceiptRequestError && error.uncertain; throw error }
      }, receipt => {
      setReceipts(current => [receipt, ...current]); setFile(null)
      if (input.current) input.current.value = ''
      if (camera.current) camera.current.value = ''
      setNotice('收据已上传并保存。')
      }, () => {
        // Refresh first when a connection failure leaves the save result uncertain.
        if (uncertainUpload.current) refresh()
        else uploadForm.current?.requestSubmit()
      })
    } catch (e) { receiptState.blockAccess(e); setUploadError(message(e)); setNeedsVerification(uncertainUpload.current); setResultChecked(false) }
    finally { uploading.current = false; setBusy(false); setTransfer(null); onBusy(false) }
  }
  return <section ref={panel} className="invoice-form-panel expense-receipts" aria-labelledby="expense-receipts-title">
    <div className="customer-form-heading">
      <h2 id="expense-receipts-title">{t("费用收据 · ")}{expense.expenseNumber}</h2>
      <button type="button" className="text-button" disabled={busy} onClick={() => draft.leave(onClose)}>{t("关闭收据")}</button>
    </div>
    <p>{t("支持 JPG、PNG、PDF，每个文件最多 10 MB。可上传多张，只有老板和管理员可以查看。")}</p>
    {!receiptState.restricted && <form ref={uploadForm} className="expense-receipt-upload" onSubmit={event => void submit(event)}>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label={t("拍摄收据照片")}
        disabled={busy || loading || !!listError || needsVerification} onChange={event => {
          const photo = event.target.files?.[0]
          if (!photo) return
          if (input.current) input.current.value = ''
          selectFile(photo)
        }} />
      <button type="button" className="secondary-button expense-receipt-camera" disabled={busy || loading || !!listError || needsVerification}
        onClick={() => { if (camera.current) { camera.current.value = ''; camera.current.click() } }}>{t("拍照收据")}</button>
      <input ref={input} hidden type="file" accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        disabled={busy || loading || !!listError || needsVerification} onChange={event => selectFile(event.target.files?.[0] ?? null)} />
      <button type="button" className="secondary-button" disabled={busy || loading || !!listError || needsVerification} onClick={() => { if (input.current) { input.current.value = ''; input.current.click() } }}>{t("选择收据文件")}</button>
      <button type="submit" className="primary-button" disabled={busy || loading || !!listError || !file || needsVerification}>{t(busy ? '上传中…' : '上传收据')}</button>
      <button type="button" className="secondary-button" disabled={busy || loading} onClick={refresh}>{t("刷新收据")}</button>
    </form>}
    <LoadState state={receiptState} label={t("费用收据")} />
    {file && <ul className="attachment-pending-list" aria-label={t("待上传收据")}><PendingAttachment file={file} busy={busy} onRemove={() => { setFile(null); if (input.current) input.current.value = '' }} /></ul>}
    <AttachmentUploadProgress progress={transfer} label={t("正在上传收据")} />
    {uploadError && <div className="attachment-retry"><p className="customer-error" role="alert">{t(uploadError)}</p>{!needsVerification && file && !receiptState.restricted && <button type="button" className="secondary-button" disabled={busy || loading || !!listError} onClick={() => uploadForm.current?.requestSubmit()}>{t("重试上传")}</button>}</div>}
    {needsVerification && <div><p role="alert">{t("文件已保留。请刷新收据列表检查上传结果，确认未保存后再重试。")}</p>
      <button type="button" className="secondary-button" disabled={busy || loading || !!listError || !resultChecked} onClick={() => {
        void interaction.confirm('确认上传结果', '请确认列表中没有刚才上传的收据，再允许重试。', '确认未保存').then(confirmed => { if (confirmed) setNeedsVerification(false) })
      }}>{t("已检查，允许重试")}</button></div>}
    {notice && <p className="customer-success" role="status">{t(notice)}</p>}
    {receiptState.available && !receipts.length && <DataState title={t("尚未上传费用收据")} description={t("可选择 JPG、PNG 或 PDF 收据，再点击上传保存。")} />}
    {receiptState.available && receipts.length > 0 && <AttachmentGallery items={receipts} label={t("收据")} url={receipt => expenseReceiptUrl(expense.id, receipt.id)} downloadUrl={receipt => expenseReceiptUrl(expense.id, receipt.id, true)} />}
  </section>
}
function message(error: unknown) { return error instanceof Error ? error.message : '收据请求失败，请稍后重试。' }
