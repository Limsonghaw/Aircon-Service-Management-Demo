import { translate as t, useLanguage, getLocale } from '../i18n'
import { archiveFileUrl, type DocumentArchive } from '../services/documentArchivesApi'
import './DocumentArchives.css'

function ArchiveDetails({ item }: { item: DocumentArchive }) {
  useLanguage()
  return <small className="archive-list-details">{t("原单据日期：")}{item.originalDate || '—'}<br />{t("导入：")}{new Date(item.createdAt).toLocaleString(getLocale(), { timeZone: 'Asia/Kuala_Lumpur' })}<br />{item.fileName}</small>
}
function ArchiveActions({ item }: { item: DocumentArchive }) {
  useLanguage()
  return <div className="archive-list-actions"><a className="table-link" href={archiveFileUrl(item.kind, item.id)} target="_blank" rel="noopener noreferrer">{t("查看原 PDF")}</a><a className="table-link" href={archiveFileUrl(item.kind, item.id, true)} download>{t("下载原件")}</a></div>
}
export function ArchiveTableRow({ item }: { item: DocumentArchive }) {
  useLanguage()
  return <tr data-list-row={`archive:${item.id}`} data-source="archive"><td>{item.originalNumber || t('原编号未填写')}<ArchiveDetails item={item} /></td><td>{item.customerName}</td><td><span className="document-source">{t("历史归档")}</span></td><td>—</td><td>{t("仅归档")}</td><td><ArchiveActions item={item} /></td></tr>
}
export function ArchiveMobileRow({ item }: { item: DocumentArchive }) {
  useLanguage()
  return <article className="quote-card" data-list-row={`archive:${item.id}`} data-source="archive"><div className="quote-card-heading"><strong>{item.originalNumber || t('原编号未填写')}</strong><span className="document-source">{t("历史归档")}</span></div><span>{item.customerName}</span><small>{t("金额：— · 仅归档")}</small><ArchiveDetails item={item} /><ArchiveActions item={item} /></article>
}
