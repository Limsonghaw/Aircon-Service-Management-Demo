import { translate as t, useLanguage } from '../i18n'
import { AttachmentGallery, PendingAttachment, AttachmentUploadProgress } from './Attachments'
import type { AttachmentProgress } from '../services/attachmentUpload'
import { DataState, LoadState } from './DataState'
import { useResource } from '../hooks/useResource'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CustomerJob } from '../services/customersApi'
import { getJobPhotos, jobPhotoUrl, JobPhotoRequestError, photoMaxBytes, uploadJobPhoto, type JobPhoto } from '../services/jobPhotosApi'
import './JobPhotos.css'
import { useUnsaved } from '../hooks/useUnsaved'
import { useInteraction } from '../contexts/InteractionContext'

type PendingPhoto = { id: number; file: File }
export function JobPhotos({ job, onClose, onBusy, embedded = false, blocked = false }: {
  job: CustomerJob; embedded?: boolean; blocked?: boolean; onClose: () => void; onBusy: (busy: boolean) => void
}) {
  useLanguage()
  const [resultChecked, setResultChecked] = useState(false)
  const loadPhotos = useCallback(async () => { const result = await getJobPhotos(job.id); setResultChecked(true); return result }, [job.id])
  const photoState = useResource(loadPhotos, [] as JobPhoto[])
  const { data: photos, setData: setPhotos, isLoading: loading } = photoState
  const listError = photoState.error ?? ''
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectionErrors, setSelectionErrors] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState('')
  const [transfer, setTransfer] = useState<AttachmentProgress | null>(null)
  const uploadControl = useRef<HTMLButtonElement>(null)
  const refreshControl = useRef<HTMLButtonElement>(null)
  const [needsRefresh, setNeedsRefresh] = useState(false)
  const panel = useRef<HTMLElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const album = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const mounted = useRef(true)
  const uploading = useRef(false)
  const interaction = useInteraction()
  const draft = useUnsaved(pending.map(item => ({ id: item.id, name: item.file.name, size: item.file.size })), true, busy, job.id, () => setPending([]))
  useEffect(() => {
    mounted.current = true
    if (!embedded) panel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    return () => { mounted.current = false }
  }, [embedded])


  function selectFiles(files: FileList | null) {
    if (!files?.length) return
    const accepted: PendingPhoto[] = []; const rejected: string[] = []
    for (const file of Array.from(files)) {
      if (!/\.(jpe?g|png)$/i.test(file.name)) rejected.push(`${file.name}：只支持 JPG、PNG；HEIC 请先转换为 JPG。`)
      else if (!file.size || file.size > photoMaxBytes) rejected.push(`${file.name}：照片不能为空，每张最多 10 MB。`)
      else if (file.name.length > 200) rejected.push(`${file.name.slice(0, 30)}…：文件名过长。`)
      else accepted.push({ id: nextId.current++, file })
    }
    setPending(current => [...current, ...accepted.filter(item => !current.some(previous =>
      previous.file.name === item.file.name && previous.file.size === item.file.size && previous.file.lastModified === item.file.lastModified))])
    setSelectionErrors(rejected); setError(''); setNotice('')
  }
  async function upload() {
    if (!pending.length || uploading.current || blocked || loading || listError || needsRefresh) return
    uploading.current = true; setBusy(true); onBusy(true); setError(''); setNotice('')
    interaction.notify({ kind: 'pending', text: '正在上传工作照片…' })
    let saved = 0
    let uncertain = false
    const failures: string[] = []
    try {
      for (let index = 0; index < pending.length; index++) {
        if (!mounted.current) break // Leaving the page does not start additional requests.
        const item = pending[index]
        setProgress(`正在上传 ${index + 1}/${pending.length}：${item.file.name}`)
        interaction.notify({ kind: 'pending', text: `正在上传照片 ${index + 1}/${pending.length}…` })
        try {
          const photo = await uploadJobPhoto(job.id, item.file, setTransfer)
          saved++
          if (mounted.current) {
            setPhotos(current => [photo, ...current])
            setPending(current => current.filter(other => other.id !== item.id))
          }
        } catch (e) {
          photoState.blockAccess(e)
          failures.push(`${item.file.name}：${message(e)}`)
          if (e instanceof JobPhotoRequestError && e.uncertain) {
            uncertain = true
            // Retain files, but require checking the result before another upload.
            if (mounted.current) {
              setNeedsRefresh(true)
              setResultChecked(false)
            }
            break
          }
          // Permission/validation failures stop the batch as well; remaining items stay selected.
          break
        }
      }
      if (mounted.current) {
        setNotice(saved ? `已保存 ${saved} 张照片。${failures.length ? '其余照片未全部完成，请查看提示。' : ''}` : '')
        setError(failures.join('\n'))
        interaction.notify(failures.length ? { kind: 'error', text: failures.join('\n'), retry: () => {
          // The current UI decides whether a refresh is required before retrying.
          (uncertain ? refreshControl : uploadControl).current?.click()
        } } : { kind: 'success', text: `已上传 ${saved} 张工作照片` })
      }
    } finally {
      uploading.current = false
      if (mounted.current) { setBusy(false); setProgress(''); setTransfer(null); onBusy(false) }
    }
  }
  const disabled = busy || blocked || loading || !!listError || needsRefresh
  return <section ref={panel} className={`invoice-form-panel job-photos${embedded ? ' job-photos-embedded' : ''}`} aria-labelledby="job-photos-title">
    <div className="customer-form-heading"><h2 id="job-photos-title">{t("工作照片 · ")}{job.jobNumber}</h2>
      {!embedded && <button type="button" className="text-button" disabled={busy} onClick={() => draft.leave(onClose)}>{t("关闭照片")}</button>}</div>
    <p>{t("拍照或从相册多选，每张 JPG、PNG 最多 10 MB。选好后点击上传保存。")}</p>
    {!photoState.restricted && <div className="job-photo-controls">
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" aria-label={t("拍摄工作照片")} disabled={disabled}
        onChange={event => selectFiles(event.target.files)} />
      <button type="button" className="secondary-button job-photo-camera" disabled={disabled}
        onClick={() => { if (camera.current) { camera.current.value = ''; camera.current.click() } }}>{t("拍照")}</button>
      <input ref={album} type="file" hidden multiple accept="image/jpeg,image/png,.jpg,.jpeg,.png" aria-label={t("多选工作照片")} disabled={disabled}
        onChange={event => selectFiles(event.target.files)} />
      <button type="button" className="secondary-button" disabled={disabled}
        onClick={() => { if (album.current) { album.current.value = ''; album.current.click() } }}>{t("从相册选择（多选）")}</button>
      <button ref={uploadControl} type="button" className="primary-button" disabled={disabled || !pending.length} onClick={() => void upload()}>
        {t(busy ? '上传中…' : `上传照片${pending.length ? `（${pending.length}）` : ''}`)}</button>
      <button ref={refreshControl} type="button" className="secondary-button" disabled={busy || blocked || loading} onClick={() => {
        setResultChecked(false); setError(''); setNotice(''); photoState.retry()
      }}>{t("刷新照片")}</button>
    </div>}
    <LoadState state={photoState} label={t("工作照片")} />
    {pending.length > 0 && <ul className="attachment-pending-list" aria-label={t("待上传照片")}>{pending.map(item => <PendingAttachment key={item.id} file={item.file} busy={busy} onRemove={() => setPending(current => current.filter(other => other.id !== item.id))} />)}</ul>}
    <AttachmentUploadProgress progress={transfer} label={t(progress || '正在上传照片')} />
    {selectionErrors.length > 0 && <p className="customer-error" role="alert">{selectionErrors.map(message => t(message)).join('\n')}</p>}
    {error && <div className="attachment-retry"><p className="customer-error" role="alert">{t(error)}</p>{!needsRefresh && !photoState.restricted && <button type="button" className="secondary-button" disabled={disabled || !pending.length} onClick={() => void upload()}>{t("重试上传")}</button>}</div>}
    {needsRefresh && <div><p role="alert">{t("上传结果未确认，文件已保留。请刷新照片列表检查；只在确认尚未保存时重试，避免重复上传。")}</p>
      <button type="button" className="secondary-button" disabled={busy || loading || !!listError || !resultChecked} onClick={() => {
        void interaction.confirm('确认上传结果', '请确认列表中没有刚才上传的照片，再允许重试。', '确认未保存').then(confirmed => { if (confirmed) setNeedsRefresh(false) })
      }}>{t("已检查，允许重试")}</button></div>}
    {notice && <p className="customer-success" role="status">{t(notice)}</p>}
    {photoState.available && !photos.length && <DataState title={t("尚未上传工作照片")} description={t("有上传权限时，可拍照或从相册选择，再点击上传保存。")} />}
    {photoState.available && photos.length > 0 && <AttachmentGallery items={photos} label={t("照片")} url={photo => jobPhotoUrl(job.id, photo.id)} downloadUrl={photo => jobPhotoUrl(job.id, photo.id, true)} />}
  </section>
}
function message(e: unknown) { return e instanceof Error ? e.message : '照片请求失败，请稍后重试。' }
