export type AttachmentProgress = { percent: number | null; phase: 'sending' | 'confirming' }
type ErrorFactory = (message: string, uncertain: boolean, status?: number) => Error
type UploadedAttachment = { id: string; fileName: string; contentType: string; fileSize: number; createdAt: string; uploadedByName: string }

// Used only when a progress observer is requested. Existing fetch callers stay compatible.
export function uploadAttachment<T extends UploadedAttachment>(url: string, file: File,
  onProgress: (progress: AttachmentProgress) => void, error: ErrorFactory): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.timeout = 240_000
    xhr.upload.onprogress = event => onProgress({
      percent: event.lengthComputable ? Math.min(100, Math.round(event.loaded / event.total * 100)) : null,
      phase: event.lengthComputable && event.loaded >= event.total ? 'confirming' : 'sending',
    })
    xhr.upload.onload = () => onProgress({ percent: 100, phase: 'confirming' })
    xhr.onerror = xhr.onabort = xhr.ontimeout = () => reject(error('连接中断，保存结果未确认。文件已保留，请刷新列表检查后再重试。', true))
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = xhr.status === 413 ? '文件不能超过 10 MB。' : '上传失败，请稍后重试。'
        try { const problem = JSON.parse(xhr.responseText); if (typeof problem.detail === 'string' && problem.detail) detail = problem.detail } catch { /* Do not expose server HTML. */ }
        reject(error(detail, xhr.status >= 500, xhr.status)); return
      }
      try {
        const result = JSON.parse(xhr.responseText) as T
        if (!result || typeof result.id !== 'string' || !result.id || typeof result.fileName !== 'string'
          || typeof result.contentType !== 'string' || !Number.isFinite(result.fileSize)
          || typeof result.createdAt !== 'string' || typeof result.uploadedByName !== 'string') throw new Error('invalid response')
        resolve(result)
      } catch { reject(error('保存结果未确认，文件已保留。请刷新列表检查后再重试。', true)) }
    }
    const body = new FormData()
    body.append('file', file)
    onProgress({ percent: 0, phase: 'sending' })
    xhr.send(body) // Browser sets the multipart boundary and sends same-origin cookies.
  })
}
