import { translate as t, useLanguage } from '../i18n'
import { PdfItemImport } from '../components/PdfItemImport'
import { ReferenceDocuments } from '../components/ReferenceDocuments'
import { usePdfImport } from '../hooks/usePdfImport'
import { ArchiveTableRow, ArchiveMobileRow } from '../components/ArchiveListRow'
import { useDocumentArchiveList } from '../hooks/useDocumentArchiveList'
import { documentList, documentSourceOptions } from '../utils/documentList'
import { DocumentArchives } from '../components/DocumentArchives'
import { useCustomerReturnedReminder } from '../hooks/useCustomerReturnedReminder'
import { CustomerReturnedDocuments } from '../components/CustomerReturnedDocuments'
import { useCustomerPicker } from '../hooks/useCustomerPicker'
import { amountSortOptions } from '../utils/listSort'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useInteraction } from '../contexts/InteractionContext'
import { useResource } from '../hooks/useResource'
import { DataState, LoadState } from '../components/DataState'
import { useClearListFilters } from '../hooks/useListPagination'
import { ActionMenu } from '../components/ActionMenu'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { ListPagination } from '../components/ListPagination'
import { ListToolbar } from '../components/ListToolbar'
import { dateOptions } from '../utils/listDateFilter'
import { useListPagination, useListParam } from '../hooks/useListPagination'
import { StatusDropdown } from '../components/StatusDropdown'
import { businessDate, isOverdueInvoice } from '../utils/dashboardTasks'
import { Link, useSearchParams } from 'react-router-dom'
import { type FormEvent, useMemo, useState } from 'react'
import { getCustomers, type Customer } from '../services/customersApi'
import { createInvoice, getInvoices, type Invoice, type InvoiceInput, type InvoiceStatus, updateInvoice } from '../services/invoicesApi'
import { formatCurrency } from '../utils/formatCurrency'
import { openDatePicker } from '../utils/openDatePicker'
import { DocumentPreview } from '../components/DocumentPreview'

const statusLabels: Record<InvoiceStatus, string> = {
  unpaid: '未付款', partial: '部分付款', paid: '已付款', overdue: '逾期',
}

const emptyForm: InvoiceInput = {
  invoiceNumber: '', customerId: '', amount: 0, dueDate: '', status: 'unpaid', notes: '', items: [], discount: 0,
}

export function InvoicesPage() {
  useLanguage()
  const [searchParams] = useSearchParams()
  const resource = useResource(getInvoices, [] as Invoice[])
  const { data: invoices, setData: setInvoices, isLoading: isLoading } = resource
  const clearFilters = useClearListFilters()
  const customerResource = useResource(getCustomers, [] as Customer[])
  const { data: customers } = customerResource
  const filter = searchParams.get('filter')
  const filterLabel = filter === 'overdue' ? '逾期发票' : filter === 'receivable' ? '其他待收款发票' : null
  const today = businessDate()
  const [searchTerm, setSearchTerm] = useListParam('q')
  const [sort, setSort] = useListParam('sort')
  const [dateFilter, setDateFilter] = useListParam('date')
  const [statusFilter, setStatusFilter] = useListParam('status')
  const [source, setSource] = useListParam('source')
  const archives = useDocumentArchiveList('invoice')
  const listReady = (source === 'archive' || resource.available) && (source === 'system' || archives.available)
  const listLoading = (source !== 'archive' && resource.isLoading) || (source !== 'system' && archives.isLoading)
  const refreshList = () => { resource.retry(); archives.retry() }
  const [customerSearch, setCustomerSearch] = useState('')
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false)
  const customerPicker = useCustomerPicker(isCustomerListOpen, setIsCustomerListOpen)
  const [form, setForm] = useState<InvoiceInput>(emptyForm)
  const pdfImport = usePdfImport<Invoice>('invoice')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [printing, setPrinting] = useState<Invoice | null>(null)
  const [returnedInvoice, setReturnedInvoice] = useState<Invoice | null>(null)
  const [returnedBusy, setReturnedBusy] = useState(false)
  const interaction = useInteraction()
  const operation = useOperation()
  const reminder = useCustomerReturnedReminder()
  const draft = useUnsaved({ form, customerSearch }, isFormOpen, isSaving, editingId, initial => { setForm(initial.form); setCustomerSearch(initial.customerSearch) })
  const calculatedAmount = form.items.reduce((sum, item) => sum + Math.round((item.quantity * item.unitPrice + Number.EPSILON) * 100) / 100, 0) - form.discount


  const filteredInvoices = useMemo(() => documentList(resource.available ? invoices : [], archives.available ? archives.data : [],
    invoice => ({ number: invoice.invoiceNumber, customerName: invoice.customerName, amount: invoice.amount, date: invoice.dueDate,
      search: [invoice.invoiceNumber, invoice.customerName, statusLabels[invoice.status], isOverdueInvoice(invoice, today) ? '逾期' : ''] }),
    invoice => (filter === 'overdue' ? isOverdueInvoice(invoice, today) : filter === 'receivable' ? invoice.status !== 'paid' && !isOverdueInvoice(invoice, today) : true)
      && (!statusFilter || (statusFilter === 'overdue' ? isOverdueInvoice(invoice, today) : invoice.status === statusFilter)),
    { source, search: searchTerm, date: dateFilter, sort, businessFilter: !!statusFilter || filter === 'overdue' || filter === 'receivable' }),
    [invoices, archives.data, archives.available, resource.available, source, searchTerm, filter, today, statusFilter, dateFilter, sort])

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase()
    if (!query) return customers
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email ?? '']
        .some((value) => value.toLocaleLowerCase().includes(query)))
  }, [customerSearch, customers])

  const pagination = useListPagination(filteredInvoices, listReady && !listLoading)
  const position = useListPosition(listReady && !listLoading)
  function showCreateForm() {
    setEditingId(null)
    setForm(emptyForm)
    setCustomerSearch('')
    setIsCustomerListOpen(false)
    setIsFormOpen(true)
    setError(null)
  }

  function showEditForm(invoice: Invoice) {
    setEditingId(invoice.id)
    setForm({
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      status: invoice.status,
      notes: invoice.notes ?? '',
      items: invoice.items ?? [], discount: invoice.discount ?? 0,
    })
    setCustomerSearch(invoice.customerName)
    setIsCustomerListOpen(false)
    setIsFormOpen(true)
    setError(null)
    requestAnimationFrame(() => document.querySelector('.invoice-form-panel')?.scrollIntoView({ block: 'start' }))
  }

  function resetForm() {
    pdfImport.reset()
    setIsFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
    setCustomerSearch('')
    setIsCustomerListOpen(false)
  }
  const panels = usePanelNavigation(resource.available, (kind, id) => {
    resetForm(); setPrinting(null); setReturnedInvoice(null)
    const invoice = invoices.find(item => item.id === id)
    if (kind === 'create') showCreateForm()
    else if (kind === 'edit' && invoice) showEditForm(invoice)
    else if (kind === 'print' && invoice) setPrinting(invoice)
    else if (kind === 'returned' && invoice) setReturnedInvoice(invoice)
  }, position.capture, resource.retry)

  function openCreateForm() { draft.leave(() => panels.open('create')) }


  function openEditForm(invoice: Invoice) { draft.leave(() => panels.open('edit', invoice.id)) }


  function closeForm() { resetForm(); panels.close() }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || operation.busy || pdfImport.recognizing) return
    if (!form.customerId) {
      setError('请从搜索结果中选择客户。')
      return
    }
    setIsSaving(true)
    setError(null)
    const input = { ...form, amount: form.items.length ? Math.round(calculatedAmount * 100) / 100 : form.amount, invoiceNumber: form.invoiceNumber.trim(), notes: form.notes?.trim() || null }
    try {
      await operation.run('正在保存发票…', '发票已保存', () => pdfImport.save(() => editingId ? updateInvoice(editingId, input) : createInvoice(input)), saved => {
        setInvoices(current => editingId ? current.map(item => item.id === saved.id ? saved : item) : [saved, ...current])
        reminder.afterSaved('invoice', invoices.find(item => item.id === editingId), saved, saved.invoiceNumber)
        draft.clean(); closeForm()
      }, () => document.querySelector<HTMLFormElement>('.invoice-form')?.requestSubmit())
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(invoice: Invoice, status: InvoiceStatus) {
    if (statusSaving || operation.busy || invoice.status === status) return
    setStatusSaving(true)
    setError(null)
    try {
      await operation.run('正在更新发票状态…', '发票状态已更新', () => updateInvoice(invoice.id, {
        invoiceNumber: invoice.invoiceNumber,
        customerId: invoice.customerId,
        amount: invoice.amount,
        dueDate: invoice.dueDate,
        status,
        notes: invoice.notes,
        items: invoice.items ?? [], discount: invoice.discount ?? 0,
      }), updated => { reminder.afterSaved('invoice', invoice, updated, updated.invoiceNumber); setError(null); setInvoices(current => current.map(item => item.id === updated.id ? updated : item)) },
      () => { void handleStatusChange(invoice, status) })
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    } finally { setStatusSaving(false) }
  }

  return (
    <main {...position.rootProps} className="unified-list-page">{t(position.restorationNotice)}
      <div className="page-heading">
        <div>
          <h1>{t("发票")}</h1>
          <p>{t("管理客户发票、金额、到期日与付款状态。")}</p>
        </div>
        <div className="page-heading-actions">{!resource.restricted && <button className="primary-button" type="button" onClick={openCreateForm} >{t("新增发票")}</button>}<button type="button" className="secondary-button" disabled={isLoading} onClick={refreshList}>{t("刷新资料")}</button></div>
      </div>

      {!resource.restricted && <DocumentArchives kind="invoice" restricted={archives.restricted} onAccessFailure={archives.blockAccess} onSaved={saved => archives.setData(current => [saved, ...current.filter(item => item.id !== saved.id)])} />}
      {isFormOpen && (
        <section className="invoice-form-panel" aria-labelledby="invoice-form-title">
          <div className="customer-form-heading">
            <h2 id="invoice-form-title">{t(editingId ? '编辑发票' : '新增发票')}</h2>
            <button className="text-button" type="button" disabled={isSaving} onClick={() => draft.leave(closeForm)}>{t("取消")}</button>
          </div>
          <LoadState state={customerResource} label={t("客户资料")} />
          {customerResource.available && !customers.length && <DataState title={t("请先建立客户资料")} description={t("发票需要关联客户，建立客户后即可继续。")} action={<Link className="secondary-button" to="/customers?create=1">{t("新增客户")}</Link>} />}
          {!editingId && <PdfItemImport selection={pdfImport.selection} documentSaved={!!pdfImport.saved} onSelect={pdfImport.select} busy={pdfImport.recognizing} onBusy={pdfImport.setRecognizing} locked={isSaving || !!pdfImport.saved}
            capacity={100 - form.items.length} beforeApply={async () => !form.items.length && form.amount > 0 ? interaction.confirm('按项目计算发票金额', `现有手填金额 RM ${form.amount} 将改为按带入项目计算，是否继续？`, '确认按项目计算') : true} onApply={items => setForm(current => ({ ...current, items: [...current.items, ...items] }))} />}
          {editingId && <ReferenceDocuments kind="invoice" documentId={editingId} />}
          {pdfImport.saved && <p role="status">{t("发票已建立。若参考原件上传未完成，请重试；新单内容已锁定，避免重复开单。")}</p>}
          <ValidatedForm className="invoice-form" onSubmit={handleSubmit} aria-busy={isSaving}>
            <fieldset className="invoice-import-fields" disabled={isSaving || pdfImport.recognizing || !!pdfImport.saved}>
            <label>{t("发票编号")}<input name="invoiceNumber" required maxLength={50} value={form.invoiceNumber} onChange={(event) => setForm({ ...form, invoiceNumber: event.target.value })} /></label>
            <div
              className="invoice-customer-field"
              ref={customerPicker}
            >
              <label htmlFor="invoice-customer-search">{t("客户")}</label>
              <div className="invoice-customer-combobox">
                <input
                  id="invoice-customer-search"
                  name="customerId"
                  data-selection-valid={!!form.customerId}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isCustomerListOpen}
                  aria-controls="invoice-customer-results"
                  required
                  autoComplete="off"
                  placeholder={t("输入姓名、电话或邮箱搜索")}
                  value={customerSearch}
                  onFocus={() => setIsCustomerListOpen(true)}
                  onChange={(event) => {
                    setCustomerSearch(event.target.value)
                    setForm({ ...form, customerId: '' })
                    setIsCustomerListOpen(true)
                  }}
                />
                {isCustomerListOpen && (
                  <div className="invoice-customer-results" id="invoice-customer-results" role="listbox">
                    {filteredCustomers.length > 0 ? filteredCustomers.map((customer) => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={customer.id === form.customerId}
                        key={customer.id}
                        onClick={() => {
                          setForm({ ...form, customerId: customer.id })
                          setCustomerSearch(customer.name)
                          setIsCustomerListOpen(false)
                        }}
                      >
                        <strong>{customer.name}</strong>
                        <small>{[customer.phone, customer.email].filter(Boolean).join(' · ')}</small>
                      </button>
                    )) : <p>{t("没有符合条件的客户")}</p>}
                  </div>
                )}
              </div>
            </div>
            <label>{t("金额（RM）")}<input required readOnly={form.items.length > 0} type="number" min="0.01" max="9999999999.99" step="0.01" value={form.items.length ? calculatedAmount : (form.amount || '')} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
            <label>{t("到期日")}<input name="dueDate" required type="date" value={form.dueDate} onClick={openDatePicker} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
            <label>{t("付款状态")}<select name="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as InvoiceStatus })}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select></label>
            <label className="invoice-form-wide">{t("备注")}<textarea name="notes" rows={3} maxLength={5000} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            <div className="invoice-form-wide invoice-items-editor">
              <h3>{t("发票明细")}</h3>
              {form.items.map((item, index) => <div className="invoice-item-edit" key={index}>
                <label>{t("项目说明")}<input name={`items.${index}.description`} required maxLength={1000} value={item.description} onChange={(event) => setForm({ ...form, items: form.items.map((value, i) => i === index ? { ...value, description: event.target.value } : value) })} /></label>
                <label>{t("数量")}<input name={`items.${index}.quantity`} required type="number" min="0.01" max="1000000" step="0.01" value={item.quantity} onChange={(event) => setForm({ ...form, items: form.items.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value) })} /></label>
                <label>{t("单价 RM")}<input name={`items.${index}.unitPrice`} required type="number" min="0" max="9999999999.99" step="0.01" value={item.unitPrice} onChange={(event) => setForm({ ...form, items: form.items.map((value, i) => i === index ? { ...value, unitPrice: Number(event.target.value) } : value) })} /></label>
                <button type="button" className="text-button" onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index), discount: form.items.length === 1 ? 0 : form.discount })}>{t("移除")}</button>
              </div>)}
              <button type="button" className="secondary-button" disabled={form.items.length >= 100} onClick={() => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unitPrice: form.items.length ? 0 : form.amount }] })}>{t("添加项目")}</button>
              {form.items.length > 0 && <label>{t("折扣 RM")}<input name="discount" required type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} /></label>}
            </div>
            </fieldset>
            <div className="customer-form-actions invoice-form-wide"><button className="primary-button" type="submit" disabled={isSaving || pdfImport.recognizing}>{t(isSaving ? '保存中…' : pdfImport.saved ? '重试保存参考原件' : '保存发票')}</button></div>
          </ValidatedForm>
        </section>
      )}

      {error && <div className="customer-error" role="alert">{t(error)}</div>}

      {source !== 'archive' && <LoadState state={resource} label={t("发票资料")} />}
      {source !== 'system' && <LoadState state={archives} label={t("历史归档")} />}
      <ListToolbar search={searchTerm} onSearch={setSearchTerm} searchLabel="搜索发票" placeholder={t("搜索编号、客户、状态或原件文件名")} pagination={pagination} loading={listLoading} unavailable={!listReady} entryLabel={filterLabel} sort={{ label: '排序', defaultLabel: '日期：最晚优先（默认）', value: sort, options: { dateAsc: '日期：最早优先', dateDesc: '日期：最晚优先', ...amountSortOptions }, onChange: setSort }} filters={[
        { label: '来源', value: source, options: documentSourceOptions, onChange: setSource },
        { label: '付款状态', value: statusFilter, options: statusLabels, onChange: setStatusFilter },
        { label: '日期', value: dateFilter, options: dateOptions, onChange: setDateFilter },
      ]} />
      <p className="document-list-hint">{t("日期：系统建立按到期日，历史归档按原单据日期。未知金额／日期排序置后；历史归档不计入欠款、收入或状态提醒。")}</p>
      {(listReady || filteredInvoices.length > 0) && (filteredInvoices.length > 0 ? (
        <>
          <div className="invoices-table-wrap">
            <table className="invoices-table">
              <thead>
                <tr>
                  <th>{t("编号")}</th>
                  <th>{t("客户")}</th>
                  <th>{t("来源")}</th>
                  <th>{t("金额")}</th>
                  <th>{t("付款状态")}</th>
                  <th className="invoice-actions-cell" aria-label={t("操作")} />
                </tr>
              </thead>
              <tbody>
                {pagination.items.map(row => {
                  if (row.source === 'archive') return <ArchiveTableRow key={row.id} item={row.document} />
                  const invoice = row.document
                  return (
                  <tr key={invoice.id} data-list-row={invoice.id} data-source="system">
                    <td>{invoice.invoiceNumber}</td>
                    <td>{invoice.customerName}<small className="invoice-due-note">{t("到期 ")}{invoice.dueDate}</small></td><td><span className="document-source">{t("系统建立")}</span></td>
                    <td>{formatCurrency(invoice.amount)}</td>
                    <td><StatusDropdown label={t(`更新 ${invoice.invoiceNumber} 状态`)} value={invoice.status} options={statusLabels} busy={statusSaving} disabled={statusSaving || operation.busy || reminder.active} onChange={status => interaction.leave(() => void handleStatusChange(invoice, status))} /></td>
                    <td className="invoice-actions-cell"><ActionMenu align="end" label={t(`更多操作：${invoice.invoiceNumber}`)} onEdit={() => openEditForm(invoice)} onPrint={() => interaction.leave(() => panels.open('print', invoice.id))} onReturnedDocuments={() => interaction.leave(() => panels.open('returned', invoice.id))} /></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="invoices-mobile-list">
            {pagination.items.map(row => {
                  if (row.source === 'archive') return <ArchiveMobileRow key={row.id} item={row.document} />
                  const invoice = row.document
                  return (
              <article className="invoice-card" key={invoice.id} data-list-row={invoice.id} data-source="system">
                <span className="document-source">{t("系统建立")}</span><div className="compact-invoice-heading">
                  <strong>{invoice.invoiceNumber}</strong>
                  <span className="compact-invoice-amount">{formatCurrency(invoice.amount)}</span>
                  <ActionMenu align="end" label={t(`更多操作：${invoice.invoiceNumber}`)} onEdit={() => openEditForm(invoice)} onPrint={() => interaction.leave(() => panels.open('print', invoice.id))} onReturnedDocuments={() => interaction.leave(() => panels.open('returned', invoice.id))} />
                </div>
                <div className="compact-invoice-contact">
                  <div><span>{invoice.customerName}</span><small>{t("到期 ")}{invoice.dueDate}</small></div>
                  <StatusDropdown label={t(`更新 ${invoice.invoiceNumber} 状态`)} value={invoice.status} options={statusLabels} busy={statusSaving} disabled={statusSaving || operation.busy || reminder.active} onChange={status => interaction.leave(() => void handleStatusChange(invoice, status))} />
                </div>
              </article>
                  )
            })}
          </div>
        </>
      ) : (
        <DataState kind={(searchTerm || dateFilter || statusFilter || filter || source) ? 'filtered' : 'empty'} title={t((searchTerm || dateFilter || statusFilter || filter || source) ? '没有符合条件的结果' : '尚未有发票资料')} description={t((searchTerm || dateFilter || statusFilter || filter || source) ? '试试其他条件，或清除搜索与筛选。' : '管理发票、到期日和付款状态。')} action={(searchTerm || dateFilter || statusFilter || filter || source) ? <button type="button" className="secondary-button" onClick={clearFilters}>{t("清除搜索与筛选")}</button> : <button type="button" className="primary-button" onClick={openCreateForm}>{t("新增发票")}</button>} />
      ))}
      {reminder.panel}
      {returnedInvoice && <section aria-label={t(`客户签回 PDF · ${returnedInvoice.invoiceNumber}`)}>
        <div className="customer-form-heading"><h2>{t("发票 · ")}{returnedInvoice.invoiceNumber}</h2><button className="text-button" type="button" disabled={returnedBusy} onClick={() => interaction.leave(() => { setReturnedInvoice(null); panels.close() })}>{t("关闭签回文件")}</button></div>
        <CustomerReturnedDocuments key={returnedInvoice.id} kind="invoice" documentId={returnedInvoice.id} onBusy={setReturnedBusy} />
      </section>}
      {printing && <DocumentPreview kind="invoice" invoice={printing} customerData={customers.find((customer) => customer.id === printing.customerId)} onClose={() => interaction.leave(() => { setPrinting(null); panels.close() })} />}
      {listReady && <ListPagination pagination={pagination} />}
    </main>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '发票请求失败，请稍后再试。'
}
