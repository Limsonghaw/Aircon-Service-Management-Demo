import { translate as t, useLanguage } from '../i18n'
import { useCallback } from 'react'
import { useResource } from '../hooks/useResource'
import { getReferenceDocuments, referenceDocumentUrl, type ReferenceDocument } from '../services/referenceDocumentsApi'
import { AttachmentGallery } from './Attachments'
import { LoadState } from './DataState'
export function ReferenceDocuments({ kind, documentId }: { kind: 'quote' | 'invoice'; documentId: string }) {
  useLanguage()
  const load = useCallback(() => getReferenceDocuments(kind, documentId), [kind, documentId])
  const resource = useResource(load, [] as ReferenceDocument[])
  return <section className="invoice-form-panel"><h3>{t("参考原件")}</h3><p>{t("用于核对新单内容，不代表客户签回、老板签名或已付款。")}</p>
    <LoadState state={resource} label={t("参考原件")} />
    {resource.available && (resource.data.length ? <AttachmentGallery items={resource.data} label={t("参考原件")} url={item => referenceDocumentUrl(kind, documentId, item.id)} downloadUrl={item => referenceDocumentUrl(kind, documentId, item.id, true)} /> : <p>{t("没有参考原件。")}</p>)}
  </section>
}
