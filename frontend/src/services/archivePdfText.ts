import { getDocument, PDFWorker } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { archiveMetadata } from '../utils/archiveMetadata'

export async function inspectArchivePdf(file: File, kind: 'quote' | 'invoice') {
  const browserWorker = new Worker(workerUrl, { type: 'module' })
  const worker = PDFWorker.create({ port: browserWorker })
  let task: ReturnType<typeof getDocument> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), worker })
        const pdf = await task.promise
        let text = ''
        for (let page = 1; page <= Math.min(pdf.numPages, 10); page++) {
          const content = await (await pdf.getPage(page)).getTextContent()
          text += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('') + '\n'
          if (text.length > 200_000) break
        }
        return { ...archiveMetadata(text, kind), message: text.trim()
          ? '已读取文字层（最多前 10 页）。请对照原件核对编号和原日期；扫描／手写部分未识别，不判断付款状态。'
          : '未读取到文字层，可能是扫描件或图片。未进行 OCR；可手填编号、日期，也可留空归档。' }
      })(),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('识别超时，文件已保留。可重试或手填后归档。')), 30000) }),
    ])
  } finally {
    clearTimeout(timeout)
    void task?.destroy().catch(() => {})
    worker.destroy(); browserWorker.terminate()
  }
}
