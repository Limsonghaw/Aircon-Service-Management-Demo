import { translate as t, useLanguage } from '../i18n'
import { ArchiveTableRow, ArchiveMobileRow } from '../components/ArchiveListRow'
import { useDocumentArchiveList } from '../hooks/useDocumentArchiveList'
import { documentList, documentSourceOptions } from '../utils/documentList'
import { DocumentArchives } from '../components/DocumentArchives'
import { useCustomerReturnedReminder } from '../hooks/useCustomerReturnedReminder'
import { amountSortOptions } from '../utils/listSort'
import { ListLink } from '../components/ListLink'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useInteraction } from '../contexts/InteractionContext'
import { useResource } from '../hooks/useResource'
import { DataState, LoadState } from '../components/DataState'
import { useClearListFilters } from '../hooks/useListPagination'
import { ListPagination } from '../components/ListPagination'
import { ListToolbar } from '../components/ListToolbar'
import { dateOptions } from '../utils/listDateFilter'
import { useListPagination, useListParam } from '../hooks/useListPagination'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getQuotes, quoteStatusLabels, updateQuoteStatus, type Quote, type QuoteStatus } from '../services/quotesApi'
import { QuoteForm } from '../components/QuoteForm'
import { useOperation } from '../hooks/useOperation'
import { QuoteStatusDropdown } from '../components/QuoteStatusDropdown'
import { formatCurrency } from '../utils/formatCurrency'

export function QuotesPage() {
  useLanguage()
  const [searchParams] = useSearchParams()
  const filter = searchParams.get('filter')
  const filterLabel = filter === 'sent' ? '待确认报价' : null
  const [searchTerm, setSearchTerm] = useListParam('q')
  const [sort, setSort] = useListParam('sort')
  const [dateFilter, setDateFilter] = useListParam('date')
  const [statusFilter, setStatusFilter] = useListParam('status')
  const resource = useResource(getQuotes, [] as Quote[])
  const [source, setSource] = useListParam('source')
  const archives = useDocumentArchiveList('quote')
  const listReady = (source === 'archive' || resource.available) && (source === 'system' || archives.available)
  const listLoading = (source !== 'archive' && resource.isLoading) || (source !== 'system' && archives.isLoading)
  const refreshList = () => { resource.retry(); archives.retry() }
  const { data: quotes, setData: setQuotes, isLoading: loading } = resource
  const clearFilters = useClearListFilters()
  const [creating, setCreating] = useState(searchParams.get('create') === '1')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState('')
  const [notice, setNotice] = useState('')
  const interaction = useInteraction()
  const operation = useOperation()
  const reminder = useCustomerReturnedReminder()

  const filteredQuotes = useMemo(() => documentList(resource.available ? quotes : [], archives.available ? archives.data : [],
    quote => ({ number: quote.quoteNumber, customerName: quote.customerName, amount: quote.total, date: quote.validUntil,
      search: [quote.quoteNumber, quote.customerName, quoteStatusLabels[quote.status]] }),
    quote => (filter !== 'sent' || quote.status === 'sent') && (!statusFilter || quote.status === statusFilter),
    { source, search: searchTerm, date: dateFilter, sort, businessFilter: !!statusFilter || filter === 'sent' }),
    [quotes, archives.data, archives.available, resource.available, source, searchTerm, filter, statusFilter, dateFilter, sort])

  const pagination = useListPagination(filteredQuotes, listReady && !listLoading)
  const position = useListPosition(listReady && !listLoading)
  const panels = usePanelNavigation(resource.available, kind => setCreating(kind === 'create'), position.capture, resource.retry)

  async function changeStatus(quote: Quote, status: QuoteStatus) {
    if (savingId || operation.busy || quote.status === status) return
    setSavingId(quote.id); setStatusError(''); setNotice('')
    try {
      await operation.run('正在保存报价状态…', '报价状态已更新', () => updateQuoteStatus(quote.id, status), saved => {
      setQuotes(current => current.map(item => item.id === saved.id ? saved : item))
      setNotice(`${saved.quoteNumber} 状态已更新为${quoteStatusLabels[saved.status]}。`)
      setStatusError('')
      reminder.afterSaved('quote', quote, saved, saved.quoteNumber)
      }, () => { void changeStatus(quote, status) })
    } catch (failure) { resource.blockAccess(failure);
      setStatusError(failure instanceof Error ? failure.message : '状态更新失败，请重试。')
    } finally { setSavingId(null) }
  }

  function statusSelect(quote: Quote) {
    return <QuoteStatusDropdown label={t(`更新 ${quote.quoteNumber} 状态`)} value={quote.status}
      busy={savingId === quote.id} disabled={savingId !== null || operation.busy || reminder.active} onChange={status => void changeStatus(quote, status)} />
  }
  return (
    <main {...position.rootProps} className="unified-list-page">{t(position.restorationNotice)}
      <div className="page-heading">
        <div>
          <h1>{t("报价")}</h1>
          <p>{t("查看项目报价并追踪客户确认。")}</p>
        </div>
        <div className="page-heading-actions">{!resource.restricted && <button className="primary-button" type="button" onClick={() => interaction.leave(() => panels.open('create'))}>{t("新增报价")}</button>}<button type="button" className="secondary-button" disabled={loading} onClick={refreshList}>{t("刷新资料")}</button></div>
      </div>

      {!resource.restricted && <DocumentArchives kind="quote" restricted={archives.restricted} onAccessFailure={archives.blockAccess} onSaved={saved => archives.setData(current => [saved, ...current.filter(item => item.id !== saved.id)])} />}
      {reminder.panel}
      {creating && <QuoteForm onCancel={() => { setCreating(false); panels.close() }} onSaved={quote => { setQuotes(current => [quote, ...current]); setCreating(false); panels.close() }} />}
      {statusError && <p role="alert" className="customer-error">{t(statusError)}</p>}
      {(savingId || notice) && <p role="status" className="customer-success">{t(savingId ? '正在保存报价状态…' : notice)}</p>}
      {source !== 'archive' && <LoadState state={resource} label={t("报价资料")} />}
      {source !== 'system' && <LoadState state={archives} label={t("历史归档")} />}
      <ListToolbar search={searchTerm} onSearch={setSearchTerm} searchLabel="搜索报价" placeholder={t("搜索编号、客户、状态或原件文件名")} pagination={pagination} loading={listLoading} unavailable={!listReady} entryLabel={filterLabel} sort={{ label: '排序', defaultLabel: '日期：最晚优先（默认）', value: sort, options: { dateAsc: '日期：最早优先', dateDesc: '日期：最晚优先', ...amountSortOptions }, onChange: setSort }} filters={[
        { label: '来源', value: source, options: documentSourceOptions, onChange: setSource },
        { label: '状态', value: statusFilter, options: quoteStatusLabels, onChange: setStatusFilter },
        { label: '日期', value: dateFilter, options: dateOptions, onChange: setDateFilter },
      ]} />
      <p className="document-list-hint">{t("日期：系统建立按有效期，历史归档按原单据日期。未知金额／日期排序置后；历史归档不计入欠款、收入或状态提醒。")}</p>
      {(listReady || filteredQuotes.length > 0) && (filteredQuotes.length > 0 ? (
        <>
          <div className="quotes-table-wrap">
            <table className="quotes-table">
              <thead>
                <tr>
                  <th>{t("编号")}</th>
                  <th>{t("客户")}</th>
                  <th>{t("来源")}</th>
                  <th>{t("总额")}</th>
                  <th>{t("状态")}</th><th>{t("操作")}</th>
                </tr>
              </thead>
              <tbody>
                {pagination.items.map(row => {
                  if (row.source === 'archive') return <ArchiveTableRow key={row.id} item={row.document} />
                  const quote = row.document
                  return (
                  <tr key={quote.id} data-list-row={quote.id} data-source="system">
                    <td><ListLink capture={position.capture} row={quote.id} className="table-link" to={`/quotes/${quote.id}`}>{quote.quoteNumber}</ListLink></td>
                    <td>{quote.customerName}</td><td><span className="document-source">{t("系统建立")}</span></td>
                    <td>{formatCurrency(quote.total)}</td>
                    <td>{statusSelect(quote)}</td><td>—</td>
                  </tr>
                )
                })}
              </tbody>
            </table>
          </div>

          <div className="quotes-mobile-list">
            {pagination.items.map(row => {
                  if (row.source === 'archive') return <ArchiveMobileRow key={row.id} item={row.document} />
                  const quote = row.document
                  return (
              <article className="quote-card" key={quote.id} data-list-row={quote.id} data-source="system">
                <div className="quote-card-heading">
                  <ListLink capture={position.capture} row={quote.id} className="table-link" to={`/quotes/${quote.id}`}><strong>{quote.quoteNumber}</strong></ListLink>
                  {statusSelect(quote)}
                </div>
                <span className="document-source">{t("系统建立")}</span><span>{quote.customerName}</span>
                <small>{formatCurrency(quote.total)}</small>
              </article>
            )
                })}
          </div>
        </>
      ) : (
        <DataState kind={(searchTerm || dateFilter || statusFilter || filter || source) ? 'filtered' : 'empty'} title={t((searchTerm || dateFilter || statusFilter || filter || source) ? '没有符合条件的结果' : '尚未有报价资料')} description={t((searchTerm || dateFilter || statusFilter || filter || source) ? '试试其他条件，或清除搜索与筛选。' : '建立报价并跟进客户确认。')} action={(searchTerm || dateFilter || statusFilter || filter || source) ? <button type="button" className="secondary-button" onClick={clearFilters}>{t("清除搜索与筛选")}</button> : <button type="button" className="primary-button" onClick={() => interaction.leave(() => panels.open('create'))}>{t("新增报价")}</button>} />
      ))}
      {listReady && <ListPagination pagination={pagination} />}
    </main>
  )
}
