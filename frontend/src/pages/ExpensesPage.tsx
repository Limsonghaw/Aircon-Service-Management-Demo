import { translate as t, useLanguage } from '../i18n'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useListParam, useListPagination } from '../hooks/useListPagination'
import { ListPagination } from '../components/ListPagination'
import { useResource } from '../hooks/useResource'
import { DataState, LoadState } from '../components/DataState'
import { useClearListFilters } from '../hooks/useListPagination'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { StatusDropdown } from '../components/StatusDropdown'
import { ListToolbar } from '../components/ListToolbar'
import { matchesListDate, dateOptions } from '../utils/listDateFilter'
import { stableListSort, dateSort, amountSortOptions } from '../utils/listSort'
import { useSearchParams } from 'react-router-dom'
import { type FormEvent, useMemo, useState } from 'react'
import { expenseStatusLabels, getExpenses, saveExpense, type Expense, type ExpenseInput, type ExpenseStatus } from '../services/expensesApi'
import { formatCurrency } from '../utils/formatCurrency'
import { openDatePicker } from '../utils/openDatePicker'
import { ExpenseReceipts } from '../components/ExpenseReceipts'

const emptyForm: ExpenseInput = { expenseNumber: '', description: '', amount: 0, expenseDate: '', status: 'pending', notes: '' }

export function ExpensesPage() {
  useLanguage()
  const [searchParams] = useSearchParams()
  const resource = useResource(getExpenses, [] as Expense[])
  const { data: expenses, setData: setExpenses, isLoading: isLoading } = resource
  const clearFilters = useClearListFilters()
  const filter = searchParams.get('filter')
  const filterLabel = filter === 'pending' ? '待审核费用' : null
  const [searchTerm, setSearchTerm] = useListParam('q')
  const [statusFilter, setStatusFilter] = useListParam('status')
  const [dateFilter, setDateFilter] = useListParam('date')
  const [sort, setSort] = useListParam('sort')
  const [form, setForm] = useState<ExpenseInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const operation = useOperation()
  const draft = useUnsaved(form, isFormOpen, isSaving, editingId, setForm)
  const [error, setError] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [receiptExpenseId, setReceiptExpenseId] = useState<string | null>(null)
  const [receiptsBusy, setReceiptsBusy] = useState(false)
  const receiptExpense = expenses.find(expense => expense.id === receiptExpenseId)


  const filteredExpenses = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase()
    return stableListSort(expenses.filter(expense => (!statusFilter || expense.status === statusFilter) && matchesListDate(expense.expenseDate, dateFilter)).filter(expense => filter !== 'pending' || expense.status === 'pending').filter((expense) =>
      [expense.expenseNumber, expense.description, expenseStatusLabels[expense.status], expense.expenseDate]
        .some((value) => value.toLocaleLowerCase().includes(query))), (a, b) => sort === 'amountDesc' ? b.amount - a.amount : sort === 'amountAsc' ? a.amount - b.amount : sort === 'dateAsc' ? dateSort(a.expenseDate, b.expenseDate) : dateSort(b.expenseDate, a.expenseDate) || dateSort(b.createdAt, a.createdAt))
  }, [expenses, searchTerm, filter, statusFilter, dateFilter, sort])

  const pagination = useListPagination(filteredExpenses, resource.available && !isLoading)
  const position = useListPosition(resource.available && !isLoading)
  function showCreateForm() {
    setEditingId(null); setForm(emptyForm); setError(''); setIsFormOpen(true)
  }

  function showEditForm(expense: Expense) {
    setEditingId(expense.id)
    setForm({ expenseNumber: expense.expenseNumber, description: expense.description, amount: expense.amount,
      expenseDate: expense.expenseDate, status: expense.status, notes: expense.notes ?? '' })
    setError(''); setIsFormOpen(true)
    requestAnimationFrame(() => document.querySelector('.invoice-form-panel')?.scrollIntoView({ block: 'start' }))
  }

  function resetForm() {
    setEditingId(null); setForm(emptyForm); setIsFormOpen(false)
  }
  const panels = usePanelNavigation(resource.available, (kind, id) => {
    resetForm(); setReceiptExpenseId(null)
    const expense = expenses.find(item => item.id === id)
    if (kind === 'create') showCreateForm()
    else if (kind === 'edit' && expense) showEditForm(expense)
    else if (kind === 'receipts' && expense) setReceiptExpenseId(id)
  }, position.capture, resource.retry)
  function openCreateForm() { draft.leave(() => panels.open('create')) }


  function openEditForm(expense: Expense) { draft.leave(() => panels.open('edit', expense.id)) }


  function closeForm() { resetForm(); panels.close() }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isSaving || operation.busy) return; setIsSaving(true); setError('')
    try {
      await operation.run('正在保存费用…', '费用已保存', () => saveExpense(editingId, { ...form, expenseNumber: form.expenseNumber.trim(),
        description: form.description.trim(), notes: form.notes?.trim() || null }), saved => {
      setExpenses((current) => editingId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current])
      draft.clean(); closeForm()
      }, () => document.querySelector<HTMLFormElement>('.invoice-form')?.requestSubmit())
    } catch (failure) { resource.blockAccess(failure);
 setError(errorMessage(failure)) }
    finally { setIsSaving(false) }
  }

  async function handleStatusChange(expense: Expense, status: ExpenseStatus) {
    if (statusSaving || operation.busy || expense.status === status) return
    setStatusSaving(true)
    setError('')
    try {
      await operation.run('正在更新费用状态…', '费用状态已更新', () => saveExpense(expense.id, { expenseNumber: expense.expenseNumber,
        description: expense.description, amount: expense.amount, expenseDate: expense.expenseDate,
        status, notes: expense.notes }), saved => { setError(''); setExpenses(current => current.map(item => item.id === saved.id ? saved : item)) },
        () => { void handleStatusChange(expense, status) })
    } catch (failure) { resource.blockAccess(failure);
 setError(errorMessage(failure)) }
    finally { setStatusSaving(false) }
  }

  return <main {...position.rootProps} className="unified-list-page">{t(position.restorationNotice)}
    <div className="page-heading">
      <div><h1>{t("费用")}</h1><p>{t("记录公司支出并管理检查状态。")}</p></div>
      <div className="page-heading-actions">{!resource.restricted && <button className="primary-button" type="button" onClick={openCreateForm}>{t("新增费用")}</button>}<button type="button" className="secondary-button" disabled={isLoading} onClick={resource.retry}>{t("刷新资料")}</button></div>
    </div>

    {isFormOpen && <section className="invoice-form-panel" aria-labelledby="expense-form-title">
      <div className="customer-form-heading"><h2 id="expense-form-title">{t(editingId ? '编辑费用' : '新增费用')}</h2>
        <button className="text-button" type="button" disabled={isSaving} onClick={() => draft.leave(closeForm)}>{t("取消")}</button></div>
      <ValidatedForm className="invoice-form" onSubmit={handleSubmit} aria-busy={isSaving}>
        <label>{t("费用编号")}<input name="expenseNumber" required maxLength={50} value={form.expenseNumber} onChange={(event) => setForm({ ...form, expenseNumber: event.target.value })} /></label>
        <label>{t("费用日期")}<input name="expenseDate" required type="date" value={form.expenseDate} onClick={openDatePicker} onChange={(event) => setForm({ ...form, expenseDate: event.target.value })} /></label>
        <label className="invoice-form-wide">{t("费用说明")}<input name="description" required maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label>{t("金额（RM）")}<input name="amount" required type="number" min="0.01" max="9999999999.99" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} /></label>
        <label>{t("检查状态")}<select name="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ExpenseStatus })}>
          {Object.entries(expenseStatusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <label className="invoice-form-wide">{t("备注")}<textarea name="notes" rows={3} maxLength={5000} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        <p className="invoice-form-wide">{t("保存费用后，可在列表点击「收据」上传文件。")}</p>
        <div className="customer-form-actions invoice-form-wide"><button className="primary-button" type="submit" disabled={isSaving}>{t(isSaving ? '保存中…' : '保存费用')}</button></div>
      </ValidatedForm>
    </section>}

    {receiptExpense && <ExpenseReceipts key={receiptExpense.id} expense={receiptExpense}
      onClose={() => { setReceiptExpenseId(null); panels.close() }} onBusy={setReceiptsBusy} />}

    {error && <div className="customer-error" role="alert">{t(error)}</div>}
      <LoadState state={resource} label={t("费用资料")} />
    <ListToolbar search={searchTerm} onSearch={setSearchTerm} searchLabel="搜索费用" placeholder={t("搜索编号、说明、日期或状态")} pagination={pagination} loading={isLoading} unavailable={!resource.available} entryLabel={filterLabel} sort={{ label: '排序', defaultLabel: '费用日期：最新优先（默认）', value: sort, options: { dateAsc: '费用日期：最早优先', ...amountSortOptions }, onChange: setSort }} filters={[
      { label: '检查状态', value: statusFilter, options: expenseStatusLabels, onChange: setStatusFilter },
      { label: '费用日期', value: dateFilter, options: dateOptions, onChange: setDateFilter },
    ]} />
    {resource.available && (filteredExpenses.length ? <>
      <div className="expenses-table-wrap"><table className="expenses-table">
        <thead><tr><th>{t("编号")}</th><th>{t("费用说明")}</th><th>{t("日期")}</th><th>{t("金额")}</th><th>{t("检查状态")}</th><th><span className="visually-hidden">{t("操作")}</span></th></tr></thead>
        <tbody>{pagination.items.map((expense) => <tr key={expense.id} data-list-row={expense.id}>
          <td>{expense.expenseNumber}</td><td>{expense.description}</td><td>{expense.expenseDate}</td><td>{formatCurrency(expense.amount)}</td>
          <td><StatusDropdown label={t(`更新 ${expense.expenseNumber} 状态`)} value={expense.status} options={expenseStatusLabels} busy={statusSaving} disabled={statusSaving || operation.busy} onChange={status => void handleStatusChange(expense, status)} /></td>
          <td className="invoice-row-actions"><button type="button" onClick={() => openEditForm(expense)}>{t("编辑")}</button>
            <button type="button" disabled={receiptsBusy} aria-label={t(`管理 ${expense.expenseNumber} 收据`)} onClick={() => draft.leave(() => panels.open('receipts', expense.id))}>{t("收据")}</button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="expenses-mobile-list">{pagination.items.map((expense) => <article className="expense-card" key={expense.id} data-list-row={expense.id}>
        <div className="expense-card-heading"><strong>{expense.expenseNumber}</strong><span className={`badge status-${expenseStatusLabels[expense.status]}`}>{t(expenseStatusLabels[expense.status])}</span></div>
        <span>{expense.description}</span><small>{expense.expenseDate} · {formatCurrency(expense.amount)}</small>
        <div className="invoice-card-actions"><StatusDropdown label={t(`更新 ${expense.expenseNumber} 状态`)} value={expense.status} options={expenseStatusLabels} busy={statusSaving} disabled={statusSaving || operation.busy} onChange={status => void handleStatusChange(expense, status)} /><button type="button" onClick={() => openEditForm(expense)}>{t("编辑")}</button>
          <button type="button" disabled={receiptsBusy} aria-label={t(`管理 ${expense.expenseNumber} 收据`)} onClick={() => draft.leave(() => panels.open('receipts', expense.id))}>{t("收据")}</button></div>
      </article>)}</div>
    </> : <DataState kind={(searchTerm || filter || statusFilter || dateFilter) ? 'filtered' : 'empty'} title={t((searchTerm || filter || statusFilter || dateFilter) ? '没有符合条件的结果' : '尚未有费用资料')} description={t("记录费用，并上传收据以供检查。")} action={(searchTerm || filter || statusFilter || dateFilter) ? <button type="button" className="secondary-button" onClick={clearFilters}>{t("清除搜索与筛选")}</button> : <button type="button" className="primary-button" onClick={openCreateForm}>{t("新增费用")}</button>} />)}
    {resource.available && <ListPagination pagination={pagination} />}
  </main>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '费用请求失败，请稍后重试。'
}
