import { translate as t, useLanguage } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { useInteraction } from '../contexts/InteractionContext'
import { inspectReferencePdf } from '../services/referencePdfText'
import type { PdfCandidate } from '../utils/pdfItems'
import type { QuoteItemInput } from '../services/quotesApi'
import type { ReferenceSelection } from '../hooks/usePdfImport'
import './PdfItemImport.css'

type Props = { selection: ReferenceSelection | null; onSelect: (file: File | null) => void; busy: boolean; onBusy: (busy: boolean) => void; locked: boolean; onApply: (items: QuoteItemInput[]) => void; capacity: number; documentSaved?: boolean; beforeApply?: () => Promise<boolean> }
export function PdfItemImport({ selection, onSelect, busy, onBusy, locked, onApply, capacity, documentSaved = false, beforeApply }: Props) {
  useLanguage()
  const interaction = useInteraction()
  const input = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const [rows, setRows] = useState<PdfCandidate[]>([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!selection) return
    const value = URL.createObjectURL(selection.file); queueMicrotask(() => setUrl(value))
    return () => URL.revokeObjectURL(value)
  }, [selection])
  async function inspect(file: File) {
    if (running.current) return
    running.current = true; onBusy(true); setError('')
    try { const result = await inspectReferencePdf(file); setRows(result.items); setNotice(result.notice + (!result.items.length ? '未找到可靠的项目结构，可手动添加项目并保留此参考原件。' : '')); setConfirmed(false) }
    catch (e) { setError(e instanceof Error ? e.message : '识别失败，文件已保留。') }
    finally { running.current = false; onBusy(false) }
  }
  function select(file?: File) {
    if (!file || locked || busy) return
    if (!/\.pdf$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024 || file.name.length > 200) { setError('请选择非空 PDF，最多 10 MB，文件名最多 200 字符。'); return }
    onSelect(file); setRows([]); setNotice(''); setConfirmed(false); void inspect(file)
  }
  const valid = rows.length > 0 && rows.length <= capacity && rows.every(row => row.description.trim() && row.description.length <= 1000 && row.quantity !== '' && Number(row.quantity) > 0 && Number(row.quantity) <= 1000000 && row.unitPrice !== '' && Number(row.unitPrice) >= 0 && Number(row.unitPrice) <= 9999999999.99 && Number.isFinite(Number(row.unitPrice)))
  return <section className="pdf-item-import" aria-label={t("从旧 PDF 带入项目")} aria-busy={busy}>
    <input ref={input} type="file" hidden accept=".pdf,application/pdf" aria-label={t("选择参考 PDF")} disabled={locked || busy} onChange={e => select(e.target.files?.[0])} />
    <button type="button" className="secondary-button" disabled={locked || busy || !!selection} onClick={() => { if (input.current) { input.current.value = ''; input.current.click() } }}>{t("从旧 PDF 带入项目")}</button>
    <p>{t("本地识别，不发送至 OCR／AI。客户请自行确认；旧编号、日期和付款状态不会带入。新 PDF 沿用现有格式。")}</p>
    {selection && <>
      <p className="pdf-reference-name">{t("参考原件：")}{selection.file.name} {url && <a href={url} target="_blank" rel="noreferrer">{t("查看原件")}</a>}</p>
      <p>{t("参考原件将在点击保存新单时上传至系统私有存储。")}</p>
      <button type="button" className="secondary-button" disabled={busy || locked} onClick={async () => { if (!rows.length || await interaction.confirm('重新识别参考 PDF', '将替换上方尚未带入的核对结果；下方表单内容保留。', '重新识别')) void inspect(selection.file) }}>{t("重试识别")}</button>
      <button type="button" className="text-button" disabled={busy || locked} onClick={() => { onSelect(null); setRows([]); setNotice(''); setError('') }}>{t("移除参考文件（已带入项目保留）")}</button>
    </>}
    {busy && <p role="status">{t("正在识别，请勿离开…")}</p>}
    {notice && <p role="status">{t(documentSaved ? "单据已保存；参考原件上传结果请查看保存提示。" : notice)}</p>}{error && <p role="alert" className="customer-error">{t(error)}</p>}
    {!!rows.length && <div>
      <h3>{t("核对识别项目")}</h3>
      {rows.map((row, index) => <div className="pdf-import-row" key={index}>
        <label>{t("项目 ")}{index + 1}{t(" 说明")}<textarea disabled={busy || locked} maxLength={1000} value={row.description} onChange={e => { setConfirmed(false); setRows(rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r)) }} /></label>
        <label>{t("数量")}<input disabled={busy || locked} type="number" min="0.01" max="1000000" step="0.01" value={row.quantity} onChange={e => { setConfirmed(false); setRows(rows.map((r, i) => i === index ? { ...r, quantity: e.target.value } : r)) }} /></label>
        <label>{t("单价（RM）")}<input disabled={busy || locked} type="number" min="0" step="0.01" value={row.unitPrice} onChange={e => { setConfirmed(false); setRows(rows.map((r, i) => i === index ? { ...r, unitPrice: e.target.value } : r)) }} /></label>
        <p>{t("原金额：")}{row.originalAmount ? `RM ${row.originalAmount}` : '—'}。{t(row.warning)}</p>
        <button type="button" className="text-button" disabled={busy || locked} onClick={() => { setConfirmed(false); setRows(rows.filter((_, i) => i !== index)) }}>{t("移除识别项目 ")}{index + 1}</button>
      </div>)}
      <label><input type="checkbox" checked={confirmed} disabled={busy || locked} onChange={e => setConfirmed(e.target.checked)} />{t("我已对照原件核对说明、数量和单价")}</label>
      {rows.length > capacity && <p role="alert">{t("带入后超过 100 项，请先减少项目。")}</p>}
      <button type="button" className="primary-button" disabled={busy || locked || !valid || !confirmed} onClick={async () => { if (beforeApply && !await beforeApply()) return; onApply(rows.map(row => ({ description: row.description.trim(), quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) }))); setRows([]); setConfirmed(false); setNotice('项目已加入，可在下方继续编辑、增加或删除。尚未建立新单。') }}>{t("确认加入项目，保留已有内容")}</button>
      <p>{t("仅移除未填写的初始空白行。识别结果不会自动覆盖下方项目；重试识别需再次确认带入。")}</p>
    </div>}
  </section>
}
