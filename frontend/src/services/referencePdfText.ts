import { getDocument, PDFWorker } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { pdfItemCandidates, type PdfWord } from '../utils/pdfItems'

export async function inspectReferencePdf(file: File) {
  const port = new Worker(workerUrl, { type: 'module' })
  const worker = PDFWorker.create({ port })
  let task: ReturnType<typeof getDocument> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        task = getDocument({ data: new Uint8Array(await file.arrayBuffer()), worker })
        const pdf = await task.promise
        if (pdf.numPages > 10) throw new Error('此 PDF 超过 10 页，请改选较短文件或手动输入；所选文件仍保留。')
        const words: PdfWord[] = []
        let imagePages = 0
        for (let page = 1; page <= pdf.numPages; page++) {
          const content = await (await pdf.getPage(page)).getTextContent()
          const items = content.items.filter(item => 'str' in item)
          if (!items.some(item => item.str.trim())) imagePages++
          for (const item of items) if (item.str.trim()) words.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], page })
          if (words.length > 30000) throw new Error('文字量过多，请手动输入；所选文件仍保留。')
        }
        return { items: pdfItemCandidates(words), notice: imagePages ? `${imagePages} 页没有文字层，未识别扫描／手写内容。请逐页核对原件。` : '已读取文字层。签名、手写和图片内容未识别；请逐项核对，避免遗漏。' }
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('识别超时，文件已保留，请重试。')), 30000) }),
    ])
  } finally { clearTimeout(timer); void task?.destroy().catch(() => {}); worker.destroy(); port.terminate() }
}
