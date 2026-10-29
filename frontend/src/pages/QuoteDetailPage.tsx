import { translate as t, useLanguage } from '../i18n'
import { useCustomerReturnedReminder } from '../hooks/useCustomerReturnedReminder'
import { CustomerReturnedDocuments } from '../components/CustomerReturnedDocuments'
import { BackToList } from '../components/BackToList'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useInteraction } from '../contexts/InteractionContext'
import { Link, useParams } from 'react-router-dom'
import { useCallback, useState, type FormEvent } from 'react'
import { convertQuoteToInvoice, convertQuoteToJob, getQuote, quoteStatusLabels, type Quote } from '../services/quotesApi'
import { LoadState } from '../components/DataState'
import { useResource } from '../hooks/useResource'
import { QuoteForm } from '../components/QuoteForm'
import { formatCurrency } from '../utils/formatCurrency'
import { openDatePicker } from '../utils/openDatePicker'
import { useTeams } from '../hooks/useTeams'
import { DocumentPreview } from '../components/DocumentPreview'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'

export function QuoteDetailPage() {
  useLanguage()
  const { quoteId } = useParams()
  const loader = useCallback(() => getQuote(quoteId ?? ''), [quoteId])
  const resource = useResource(loader, null as Quote | null)
  const { data: quote, setData: setQuote } = resource
  const [editing, setEditing] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [conversion, setConversion] = useState<'invoice' | 'job' | null>(null)
  const [conversionMessage, setConversionMessage] = useState('')
  const [conversionError, setConversionError] = useState('')
  const [isConverting, setIsConverting] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: '', dueDate: '' })
  const [jobForm, setJobForm] = useState({ jobNumber: '', title: '', serviceDate: '', team: '未安排' })
  const teamsState = useTeams()
  const operation = useOperation()
  const reminder = useCustomerReturnedReminder()
  const draft = useUnsaved({ invoiceForm, jobForm }, !!conversion, isConverting, conversion, initial => { setInvoiceForm(initial.invoiceForm); setJobForm(initial.jobForm) })
  const interaction = useInteraction()
  const position = useListPosition(resource.available && !resource.isLoading)
  const panels = usePanelNavigation(resource.available, kind => { setEditing(kind === 'edit'); setPrinting(kind === 'print') }, position.capture, resource.retry)
  function closePanel() { setEditing(false); setPrinting(false); panels.close() }
  if (!resource.available) return <main {...position.rootProps}>{t(position.restorationNotice)}<BackToList path="/quotes">{t("← 返回报价列表")}</BackToList><LoadState state={resource} label={t("报价详情")} /></main>

  if (!quote) {
    return (
      <main {...position.rootProps}>{t(position.restorationNotice)}
        <div className="page-heading">
          <div>
            <h1>{t("找不到报价")}</h1>
            <p>{t("这个报价编号不存在，或资料尚未建立。")}</p>
          </div>
        </div>
        <BackToList className="secondary-button" path="/quotes">{t("← 返回报价列表")}</BackToList>
      </main>
    )
  }

  function openConversion(type: 'invoice' | 'job') {
    draft.leave(() => {
    setConversionMessage('')
    setConversionError('')
    setConversion(type)
    if (type === 'invoice') {
      setInvoiceForm({ invoiceNumber: quote!.quoteNumber.replace(/^QT/i, 'INV'), dueDate: addDays(30) })
    } else {
      setJobForm({ jobNumber: quote!.quoteNumber.replace(/^QT/i, 'JOB'),
        title: quote!.items.map((item) => item.description).join('、').slice(0, 200),
        serviceDate: localDate(new Date()), team: '未安排' })
    }
    })
  }

  async function createInvoice(event: FormEvent) {
    event.preventDefault(); if (isConverting || operation.busy) return; setIsConverting(true); setConversionError('')
    try {
      await operation.run('正在建立发票…', '发票已建立', () => convertQuoteToInvoice(quote!.id, invoiceForm), result => {
      draft.clean()
      setQuote({ ...quote!, invoiceId: result.id }); setConversion(null); setConversionMessage('发票已建立。')
      }, () => document.querySelector<HTMLFormElement>('.invoice-form')?.requestSubmit())
    } catch (failure) { setConversionError(failure instanceof Error ? failure.message : '转换发票失败。') }
    finally { setIsConverting(false) }
  }

  async function createJob(event: FormEvent) {
    event.preventDefault(); if (isConverting || operation.busy) return; setIsConverting(true); setConversionError('')
    try {
      await operation.run('正在建立工作单…', '工作单已建立', () => convertQuoteToJob(quote!.id, jobForm), result => {
      draft.clean()
      setQuote({ ...quote!, jobId: result.id }); setConversion(null); setConversionMessage('工作单已建立。')
      }, () => document.querySelector<HTMLFormElement>('.invoice-form')?.requestSubmit())
    } catch (failure) { setConversionError(failure instanceof Error ? failure.message : '转换工作单失败。') }
    finally { setIsConverting(false) }
  }

  return (
    <main {...position.rootProps}>{t(position.restorationNotice)}
      <BackToList path="/quotes">{t("← 返回报价列表")}</BackToList><LoadState state={resource} label={t("报价详情")} />

      <div className="page-heading quote-detail-heading">
        <div>
          <h1>{t("报价详情")}</h1>
          <p>{quote.quoteNumber} · {quote.customerName}{t(" · 有效期至 ")}{quote.validUntil.replaceAll('-', '/')}</p>
        </div>
        <span className="badge alert">{t(quoteStatusLabels[quote.status])}</span>
        <button className="primary-button" type="button" onClick={() => draft.leave(() => panels.open('edit'))}>{t("编辑报价 / 状态")}</button>
        <button className="secondary-button" type="button" onClick={() => interaction.leave(() => panels.open('print'))}>{t("PDF / 老板签名")}</button>
      </div>

      {editing && <QuoteForm key={quote.id} quote={quote} onCancel={closePanel} onSaved={saved => { reminder.afterSaved('quote', quote, saved, saved.quoteNumber); setQuote(saved); closePanel() }} />}
      {printing && <DocumentPreview kind="quote" quote={quote} onClose={() => interaction.leave(closePanel)} />}
      {quote.status === 'accepted' && <section className="quote-conversion-panel" aria-labelledby="quote-conversion-title">
        <div><h2 id="quote-conversion-title">{t("建立后续资料")}</h2><p>{t("客户和报价金额会自动从这张报价带入。")}</p></div>
        <div className="quote-conversion-actions">
          {quote.invoiceId ? <Link className="secondary-button" to="/invoices">{t("已建立发票 →")}</Link>
            : <button className="secondary-button" type="button" onClick={() => openConversion('invoice')}>{t("转换成发票")}</button>}
          {quote.jobId ? <Link className="secondary-button" to="/jobs">{t("已建立工作单 →")}</Link>
            : <button className="secondary-button" type="button" onClick={() => openConversion('job')}>{t("建立工作单")}</button>}
        </div>
      </section>}
      {conversionMessage && <p className="customer-success" role="status">{t(conversionMessage)}</p>}
      {(conversionError || teamsState.error) && <p className="customer-error" role="alert">{t(conversionError || teamsState.error)}</p>}
      {conversion === 'invoice' && <section className="invoice-form-panel"><div className="customer-form-heading"><h2>{t("从报价建立发票")}</h2><button className="text-button" type="button" disabled={isConverting} onClick={() => draft.leave(() => setConversion(null))}>{t("取消")}</button></div>
        <ValidatedForm className="invoice-form" onSubmit={createInvoice} aria-busy={isConverting}>
          <label>{t("发票编号")}<input name="invoiceNumber" required maxLength={50} value={invoiceForm.invoiceNumber} onChange={(event) => setInvoiceForm({ ...invoiceForm, invoiceNumber: event.target.value })} /></label>
          <label>{t("到期日")}<input name="dueDate" required type="date" value={invoiceForm.dueDate} onClick={openDatePicker} onChange={(event) => setInvoiceForm({ ...invoiceForm, dueDate: event.target.value })} /></label>
          <div className="customer-form-actions invoice-form-wide"><button className="primary-button" disabled={isConverting}>{t(isConverting ? '建立中…' : `建立 ${formatCurrency(quote.total)} 发票`)}</button></div>
        </ValidatedForm></section>}
      {conversion === 'job' && <section className="invoice-form-panel"><div className="customer-form-heading"><h2>{t("从报价建立工作单")}</h2><button className="text-button" type="button" disabled={isConverting} onClick={() => draft.leave(() => setConversion(null))}>{t("取消")}</button></div>
        <ValidatedForm className="invoice-form" onSubmit={createJob} aria-busy={isConverting}>
          <label>{t("工作单编号")}<input name="jobNumber" required maxLength={50} value={jobForm.jobNumber} onChange={(event) => setJobForm({ ...jobForm, jobNumber: event.target.value })} /></label>
          <label>{t("服务日期")}<input name="serviceDate" required type="date" value={jobForm.serviceDate} onClick={openDatePicker} onChange={(event) => setJobForm({ ...jobForm, serviceDate: event.target.value })} /></label>
          <label className="invoice-form-wide">{t("工作内容")}<input name="title" required maxLength={200} value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} /></label>
          <label>{t("团队")}<select name="team" value={jobForm.team} onChange={(event) => setJobForm({ ...jobForm, team: event.target.value })}><option value="未安排">{t("未安排")}</option>
            {teamsState.teams.filter((team) => team.isActive).map((team) => <option key={team.id} value={team.name}>{team.name}</option>)}</select></label>
          <div className="customer-form-actions invoice-form-wide"><button className="primary-button" disabled={isConverting}>{t(isConverting ? '建立中…' : '建立工作单')}</button></div>
        </ValidatedForm></section>}
      {reminder.panel}
      {!reminder.active && <CustomerReturnedDocuments key={quote.id} kind="quote" documentId={quote.id} blocked={editing || printing || isConverting} />}
      {quote.notes && <p className="quote-notes">{quote.notes}</p>}
      <div className="quote-items-table-wrap">
        <table className="quote-items-table">
          <thead>
            <tr>
              <th>{t("项目说明")}</th>
              <th>{t("数量")}</th>
              <th>{t("单价")}</th>
              <th>{t("小计")}</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.unitPrice)}</td>
                <td>{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="quote-items-mobile-list">
        {quote.items.map((item) => (
          <article className="quote-item-card" key={item.id}>
            <strong>{item.description}</strong>
            <span>{item.quantity} × {formatCurrency(item.unitPrice)}</span>
            <small>{t("小计：")}{formatCurrency(item.subtotal)}</small>
          </article>
        ))}
      </div>

      <div className="quote-total">
        <span>{t("报价总计")}</span>
        <strong>{formatCurrency(quote.total)}</strong>
      </div>
    </main>
  )
}

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return localDate(date)
}
