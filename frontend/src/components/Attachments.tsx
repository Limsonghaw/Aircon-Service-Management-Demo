import { translate as t, useLanguage, getLocale } from '../i18n'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DataState, LoadState } from './DataState'
import { useResource } from '../hooks/useResource'
import { ApiValidationError } from '../services/ApiValidationError'
import type { AttachmentProgress } from '../services/attachmentUpload'
import './Attachments.css'
import PdfPages from './PdfPages'

export type AttachmentItem = { id: string; fileName: string; contentType: string; fileSize: number; createdAt: string; uploadedByName: string }
const attachmentSize = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'
const isPdf = (type: string, name: string) => type === 'application/pdf' || /\.pdf$/i.test(name)
const retryUrl = (url: string, attempt: number) => !attempt || url.startsWith('blob:') ? url : url + (url.includes('?') ? '&' : '?') + 'previewRetry=' + attempt
function useFileUrl(file: File | Blob | null) {
  const [entry, setEntry] = useState<{ file: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!file) return
    const next = URL.createObjectURL(file)
    // Synchronize the browser-owned object URL; cleanup releases it when the file changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntry({ file, url: next })
    return () => URL.revokeObjectURL(next)
  }, [file])
  return entry?.file === file ? entry?.url ?? '' : ''
}
export function AttachmentUploadProgress({ progress, label }: { progress: AttachmentProgress | null; label: string }) {
  useLanguage()
  if (!progress) return null
  return <div className="attachment-progress" role="status" aria-live="polite">
    <strong>{t(progress.phase === 'confirming' ? '文件已发送，正在确认保存…' : label + (progress.percent === null ? '' : ' · ' + progress.percent + '%'))}</strong>
    <progress max={100} value={progress.percent ?? undefined} aria-label={t("文件发送进度")} />
    <small>{t("接口确认保存成功后，才会显示上传完成。")}</small>
  </div>
}
export function PendingAttachment({ file, busy, onRemove }: { file: File; busy: boolean; onRemove: () => void }) {
  useLanguage()
  const url = useFileUrl(file)
  const [preview, setPreview] = useState(false)
  return <li className="attachment-pending-card">
    {url && <AttachmentThumbnail url={url} name={file.name} pdf={isPdf(file.type, file.name)} onPreview={() => setPreview(true)} />}
    <div className="attachment-file-info"><strong>{file.name}</strong><small>{t(isPdf(file.type, file.name) ? 'PDF' : '图片')} · {attachmentSize(file.size)}{t(" · 待上传")}</small></div>
    <button type="button" className="text-button" disabled={busy} onClick={onRemove} aria-label={t('移除待上传文件 ' + file.name)}>{t("移除")}</button>
    {preview && <AttachmentPreview url={url} name={file.name} pdf={isPdf(file.type, file.name)} onClose={() => setPreview(false)} />}
  </li>
}
export function AttachmentGallery({ items, url, downloadUrl, label }: {
  items: AttachmentItem[]; url: (item: AttachmentItem) => string; downloadUrl: (item: AttachmentItem) => string; label: string
}) {
  useLanguage()
  const [preview, setPreview] = useState<AttachmentItem | null>(null)
  return <>
    <ul className="attachment-gallery" aria-label={t('已保存' + label)}>
      {items.map(item => <li className="attachment-card" key={item.id}>
        <AttachmentThumbnail url={url(item)} name={item.fileName} pdf={isPdf(item.contentType, item.fileName)} onPreview={() => setPreview(item)} />
        <div className="attachment-file-info"><strong>{item.fileName}</strong><small>{t(isPdf(item.contentType, item.fileName) ? 'PDF' : '图片')} · {attachmentSize(item.fileSize)}</small>
          <small>{item.uploadedByName} · {new Date(item.createdAt).toLocaleString(getLocale(), { timeZone: 'Asia/Kuala_Lumpur' })}</small></div>
        <div className="attachment-card-actions"><button className="secondary-button" type="button" onClick={() => setPreview(item)} aria-label={t('预览' + label + ' ' + item.fileName)}>{t("预览")}</button>
          <a className="secondary-button" href={downloadUrl(item)} download aria-label={t('下载' + label + ' ' + item.fileName)}>{t("下载")}</a></div>
      </li>)}
    </ul>
    {preview && <AttachmentPreview url={url(preview)} name={preview.fileName} pdf={isPdf(preview.contentType, preview.fileName)} download={downloadUrl(preview)} onClose={() => setPreview(null)} />}
  </>
}
function AttachmentThumbnail({ url, name, pdf, onPreview }: { url: string; name: string; pdf: boolean; onPreview: () => void }) {
  useLanguage()
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (failed) return <div className="attachment-thumb-error" role="alert">{t("缩略图加载失败")}<button className="text-button" type="button" onClick={() => { setFailed(false); setLoaded(false); setAttempt(x => x + 1) }}>{t("重试缩略图")}</button></div>
  return <button className={'attachment-thumbnail' + (pdf ? ' attachment-pdf-thumbnail' : '')} type="button" onClick={onPreview} aria-label={t('预览附件 ' + name)}>
    {pdf ? <><span aria-hidden="true">PDF</span><small>{t("点击查看文件")}</small></> : <>
      {!loaded && <span className="attachment-image-loading" role="status">{t("正在加载缩略图…")}</span>}
      <img key={attempt} src={retryUrl(url, attempt)} alt={name} style={{ visibility: loaded ? 'visible' : 'hidden' }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </>}
  </button>
}
function AttachmentPreview({ url, name, pdf, download, onClose }: { url: string; name: string; pdf: boolean; download?: string; onClose: () => void }) {
  useLanguage()
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  useLayoutEffect(() => {
    const element = dialog.current!
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element.showModal()
    return () => { element.close(); document.body.style.overflow = overflow; trigger?.focus({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog ref={dialog} className="attachment-preview-dialog" aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id={id}>{name}</h2><button type="button" className="secondary-button" autoFocus onClick={onClose} aria-label={t("关闭附件预览")}>{t("关闭")}</button></header>
    <div className="attachment-preview-body">{pdf ? <PdfPreview url={url} /> : <>
      {status === 'loading' && <p role="status">{t("正在加载图片预览…")}</p>}
      {status === 'failed' ? <DataState kind="error" title={t("图片预览加载失败")} description={t("请检查网络，或刷新附件列表确认访问权限。")} action={<button className="secondary-button" type="button" onClick={() => { setAttempt(x => x + 1); setStatus('loading') }}>{t("重试预览")}</button>} /> :
        <img key={attempt} src={retryUrl(url, attempt)} alt={name} style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }} onLoad={() => setStatus('ready')} onError={() => setStatus('failed')} />}
    </>}</div>
    <footer><span>{t("仅预览文件，不会更改已选择或已保存的资料。")}</span>{download && <a className="secondary-button" href={download} download>{t("下载文件")}</a>}</footer>
  </dialog>, document.body)
}
function PdfPreview({ url }: { url: string }) {
  useLanguage()
  const load = useCallback(async () => {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) throw new ApiValidationError('PDF暂时无法读取，请重试或检查访问权限。', {}, response.status)
    if (!response.headers.get('Content-Type')?.includes('application/pdf')) throw new Error('PDF文件格式无法读取。')
    return response.blob()
  }, [url])
  const state = useResource(load, null as Blob | null)
  const blobUrl = useFileUrl(state.data)
  return <div className="attachment-pdf-preview"><LoadState state={state} label={t("PDF预览")} />
    {state.available && blobUrl && state.data && <><PdfPages blob={state.data} /><p><a href={blobUrl} target="_blank" rel="noopener noreferrer">{t("打开原PDF（系统阅读器）")}</a></p></>}
  </div>
}
