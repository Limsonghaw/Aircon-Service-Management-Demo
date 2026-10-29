import { useRef, useState } from 'react'
import { useUnsaved } from './useUnsaved'
import { createReturnedUploadId } from '../services/customerReturnedDocumentsApi'
import { uploadReferenceDocument } from '../services/referenceDocumentsApi'

export type ReferenceSelection = { id: string; file: File }
export function usePdfImport<T extends { id: string }>(kind: 'quote' | 'invoice') {
  const [selection, setSelection] = useState<ReferenceSelection | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [saved, setSaved] = useState<T | null>(null)
  const [generation, setGeneration] = useState(0)
  const savedRef = useRef<T | null>(null)
  const guard = useUnsaved(selection?.id ?? '', true, recognizing, generation, () => setSelection(null))
  function reset() { setSelection(null); setSaved(null); savedRef.current = null; guard.clean(); setGeneration(value => value + 1) }
  async function save(create: () => Promise<T>): Promise<T> {
    // Once the document is confirmed, a retry only uploads the same immutable reference.
    const record = savedRef.current ?? await create()
    if (!record || typeof record.id !== 'string' || !record.id) throw new Error('单据保存结果未确认，请先刷新列表核对；所选文件仍保留。')
    savedRef.current = record; setSaved(record)
    if (selection) {
      try { await uploadReferenceDocument(kind, record.id, selection.id, selection.file, () => {}) }
      catch (error) { throw new Error(`单据已保存，参考原件尚未确认。请点击重试保存参考原件，不会重复开单。${error instanceof Error ? error.message : ''}`, { cause: error }) }
    }
    guard.clean()
    return record
  }
  return { selection, recognizing, setRecognizing, saved, reset, save,
    select: (file: File | null) => setSelection(file ? { id: createReturnedUploadId(), file } : null) }
}
