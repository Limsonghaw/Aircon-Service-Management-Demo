import { translate as t, useLanguage } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { getDocument, PDFWorker, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { DataState } from './DataState'

// Reader code loads with the application; the dedicated worker starts only for a preview.
export default function PdfPages({ blob }: { blob: Blob }) {
  useLanguage()
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(1)
  const [width, setWidth] = useState(0)
  const [rendered, setRendered] = useState('')
  const [renderError, setRenderError] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    let task: ReturnType<typeof getDocument> | undefined
    let browserWorker: Worker | undefined
    let pdfWorker: PDFWorker | undefined
    const fail = () => { if (active) setError('PDF暂时无法读取，请检查网络或文件格式（损坏／密码保护）。可重试，或下载后使用系统阅读器。') }
    const timeout = window.setTimeout(() => { fail(); void task?.destroy().catch(() => {}); browserWorker?.terminate() }, 30000)
    void blob.arrayBuffer().then(buffer => {
      if (!active) return
      // Each retry gets a fresh worker realm and URL, avoiding cached failed module imports.
      browserWorker = new Worker(workerUrl + (workerUrl.includes('?') ? '&' : '?') + 'readerRetry=' + attempt, { type: 'module' })
      browserWorker.onerror = event => { event.preventDefault(); window.clearTimeout(timeout); fail(); void task?.destroy().catch(() => {}); browserWorker?.terminate() }
      browserWorker.onmessageerror = fail
      pdfWorker = PDFWorker.create({ port: browserWorker })
      task = getDocument({ data: new Uint8Array(buffer), worker: pdfWorker })
      return task.promise.then(pdf => { window.clearTimeout(timeout); if (active) setDocument(pdf) })
    }).catch(() => { window.clearTimeout(timeout); fail() })
    return () => { active = false; window.clearTimeout(timeout); void task?.destroy().catch(() => {}); pdfWorker?.destroy(); browserWorker?.terminate() }
  }, [blob, attempt])
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)))
    observer.observe(host.current!)
    return () => observer.disconnect()
  }, [])
  const stamp = page + ':' + width + ':' + attempt
  useEffect(() => {
    if (!document || !width || !canvas.current) return
    let active = true
    let task: RenderTask | undefined
    void document.getPage(page).then(pdfPage => {
      if (!active) return
      const output = canvas.current!
      const viewport = pdfPage.getViewport({ scale: Math.min(width, 1200) / pdfPage.getViewport({ scale: 1 }).width })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      output.width = Math.floor(viewport.width * ratio); output.height = Math.floor(viewport.height * ratio)
      output.style.width = viewport.width + 'px'; output.style.height = viewport.height + 'px'
      task = pdfPage.render({ canvas: output, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      return task.promise.then(() => { if (active) { setRendered(stamp); setRenderError('') } })
    }).catch(() => { if (active) setRenderError('这一页暂时无法显示，请重试，或打开原PDF。') })
    return () => { active = false; task?.cancel() }
  }, [document, page, width, stamp])
  function retry() { setError(''); setRenderError(''); setDocument(null); setRendered(''); setAttempt(x => x + 1) }
  return <div ref={host} className="attachment-pdf-pages">
    {error ? <DataState kind="error" title={t("PDF预览失败")} description={t(error)} action={<button type="button" className="secondary-button" onClick={retry}>{t("重试预览")}</button>} /> : <>
      {document && <nav className="attachment-pdf-pagination" aria-label={t("PDF翻页")}><button className="secondary-button" type="button" disabled={page <= 1} onClick={() => setPage(x => x - 1)}>{t("上一页")}</button><span role="status">{t("第 ")}{page} / {document.numPages}{t(" 页")}</span><button className="secondary-button" type="button" disabled={page >= document.numPages} onClick={() => setPage(x => x + 1)}>{t("下一页")}</button></nav>}
      {renderError ? <DataState kind="error" title={t("PDF页面显示失败")} description={renderError} action={<button type="button" className="secondary-button" onClick={retry}>{t("重试预览")}</button>} /> : <>
        {rendered !== stamp && <p role="status">{t("正在显示PDF页面…")}</p>}
        <canvas ref={canvas} style={{ display: 'block', visibility: rendered === stamp ? 'visible' : 'hidden' }} role="img" aria-label={t('PDF第 ' + page + ' 页；可使用打开PDF入口读取可访问原文件')} />
      </>}
    </>}
  </div>
}
