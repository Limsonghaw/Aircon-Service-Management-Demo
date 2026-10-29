import { translate as t, useLanguage } from '../i18n'
import { stableListSort, dateSort, serverOrder } from '../utils/listSort'
import { ListLink } from '../components/ListLink'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useResource } from '../hooks/useResource'
import { DataState, LoadState } from '../components/DataState'
import { useClearListFilters } from '../hooks/useListPagination'
import { ListPagination } from '../components/ListPagination'
import { ListToolbar } from '../components/ListToolbar'
import { matchesListDate, dateOptions } from '../utils/listDateFilter'
import { useListPagination, useListParam } from '../hooks/useListPagination'
import { type FormEvent, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FormDrawer } from '../components/FormDrawer'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { useInteraction } from '../contexts/InteractionContext'
import { createCustomer, deleteCustomer, getCustomers, type Customer, type CustomerInput, updateCustomer } from '../services/customersApi'

const emptyForm: CustomerInput = { name: '', customerType: 'individual', phone: '', email: '', address: '', notes: '' }
const typeLabels = { individual: '个人', business: '企业' } as const

export function CustomersPage() {
  useLanguage()
  const resource = useResource(getCustomers, [] as Customer[])
  const { data: customers, setData: setCustomers, isLoading: isLoading } = resource
  const clearFilters = useClearListFilters()
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useListParam('q')
  const [dateFilter, setDateFilter] = useListParam('date')
  const [sort, setSort] = useListParam('sort')
  const [typeFilter, setTypeFilter] = useListParam('type')
  const [form, setForm] = useState<CustomerInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(searchParams.get('create') === '1')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = useOperation()
  const interaction = useInteraction()
  const draft = useUnsaved(form, isFormOpen, isSaving, editingId, setForm)

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase()
    return stableListSort(customers.filter(customer => matchesListDate(customer.createdAt, dateFilter)).filter(customer => !typeFilter || customer.customerType === typeFilter).filter((customer) => [customer.name, typeLabels[customer.customerType], customer.phone, customer.email ?? '']
      .some((value) => value.toLocaleLowerCase().includes(query))), sort ? (a, b) => sort === 'newest' ? dateSort(b.createdAt, a.createdAt) : sort === 'oldest' ? dateSort(a.createdAt, b.createdAt) : sort === 'nameDesc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name) : serverOrder(customers, customer => customer.name))
  }, [customers, searchTerm, typeFilter, dateFilter, sort])

  const pagination = useListPagination(filteredCustomers, resource.available && !isLoading)
  const position = useListPosition(resource.available && !isLoading)
  function showCreateForm() {
    setEditingId(null)
    setForm(emptyForm)
    setIsFormOpen(true)
    setError(null)
  }

  function showEditForm(customer: Customer) {
    setEditingId(customer.id)
    setForm({ name: customer.name, customerType: customer.customerType, phone: customer.phone, email: customer.email ?? '', address: customer.address ?? '', notes: customer.notes ?? '' })
    setIsFormOpen(true)
    setError(null)
  }

  function resetForm() {
    setIsFormOpen(false)
    setEditingId(null)
    setForm(emptyForm)
  }
  const panels = usePanelNavigation(resource.available, (kind, id) => {
    if (kind === 'create') showCreateForm()
    else if (kind === 'edit') { const customer = customers.find(item => item.id === id); if (customer) showEditForm(customer); else resetForm() }
    else resetForm()
  }, position.capture, resource.retry)

  function openCreateForm() { draft.leave(() => panels.open('create')) }


  function openEditForm(customer: Customer) { draft.leave(() => panels.open('edit', customer.id)) }


  function closeForm() { resetForm(); panels.close() }


  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving || operation.busy) return
    setIsSaving(true)
    setError(null)
    const input = normalizeInput(form)

    try {
      await operation.run('正在保存客户…', '客户已保存', () => editingId ? updateCustomer(editingId, input) : createCustomer(input), saved => {
        setCustomers(current => editingId ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.name.localeCompare(b.name)))
        draft.clean(); closeForm()
      }, () => document.querySelector<HTMLFormElement>('.form-drawer-form')?.requestSubmit())
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(customer: Customer) {
    if (operation.busy || !await interaction.confirm('删除客户', `确定要删除客户“${customer.name}”吗？`, '删除')) return
    setError(null)
    try {
      await operation.run('正在删除客户…', '客户已删除', () => deleteCustomer(customer.id), () => {
        setError(null)
        setCustomers(current => current.filter(item => item.id !== customer.id))
        if (editingId === customer.id) { draft.clean(); closeForm() }
      })
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    }
  }

  return (
    <main {...position.rootProps} className="unified-list-page">{t(position.restorationNotice)}
      <div className="page-heading">
        <div><h1>{t("客户")}</h1><p>{t("管理客户的联系人与联络资料。")}</p></div>
        <div className="page-heading-actions">{!resource.restricted && <button className="primary-button" type="button" onClick={openCreateForm}>{t("新增客户")}</button>}<button type="button" className="secondary-button" disabled={isLoading} onClick={resource.retry}>{t("刷新资料")}</button></div>
      </div>

      {isFormOpen && (
        <FormDrawer title={t(editingId ? '编辑客户' : '新增客户')} busy={isSaving} onClose={() => draft.leave(closeForm)}>
          <ValidatedForm className="form-drawer-form" onSubmit={handleSubmit} aria-busy={isSaving}>
            <div className="form-drawer-body">
              {resource.failure && <LoadState state={resource} label={t("客户资料")} />}
              {error && <div className="customer-error" role="alert">{t(error)}</div>}
              <div className="customer-form">
                <FormField label={t("客户名称 *")}><input name="name" required maxLength={200} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></FormField>
                <FormField label={t("客户类型 *")}>
                  <select name="customerType" value={form.customerType} onChange={(event) => setForm({ ...form, customerType: event.target.value as CustomerInput['customerType'] })}>
                    <option value="individual">{t("个人")}</option><option value="business">{t("企业")}</option>
                  </select>
                </FormField>
                <FormField label={t("联系电话 *")}><input name="phone" type="tel" required maxLength={50} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></FormField>
                <FormField label={t("电子邮箱")}><input name="email" type="email" maxLength={320} value={form.email ?? ''} onChange={(event) => setForm({ ...form, email: event.target.value })} /></FormField>
                <FormField label={t("地址")} wide><textarea name="address" maxLength={1000} rows={2} value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} /></FormField>
                <FormField label={t("备注")} wide><textarea name="notes" maxLength={5000} rows={3} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></FormField>
              </div>
            </div>
            <footer className="form-drawer-footer">
              <button className="text-button" type="button" disabled={isSaving} onClick={() => draft.leave(closeForm)}>{t("取消")}</button>
              <button className="primary-button" type="submit" disabled={isSaving}>{t(isSaving ? '保存中…' : '保存客户')}</button>
            </footer>
          </ValidatedForm>
        </FormDrawer>
      )}

      {error && !isFormOpen && <div className="customer-error" role="alert">{t(error)}</div>}

      <LoadState state={resource} label={t("客户资料")} />
      <ListToolbar search={searchTerm} onSearch={setSearchTerm} searchLabel="搜索客户" placeholder={t("搜索客户、电话、邮箱或类型")} pagination={pagination} loading={isLoading} unavailable={!resource.available} sort={{ label: '排序', defaultLabel: '客户名称：从 A 到 Z（默认）', value: sort, options: { nameDesc: '客户名称：从 Z 到 A', newest: '建立日期：最新优先', oldest: '建立日期：最早优先' }, onChange: setSort }} filters={[
        { label: '客户类型', value: typeFilter, options: typeLabels, onChange: setTypeFilter },
        { label: '建立日期', value: dateFilter, options: dateOptions, onChange: setDateFilter },
      ]} />
      {resource.available && (filteredCustomers.length > 0 ? (
        <>
          <div className="customers-table-wrap"><table className="customers-table">
            <thead><tr><th>{t("客户")}</th><th>{t("类型")}</th><th>{t("联系电话")}</th><th>{t("电子邮箱")}</th><th><span className="visually-hidden">{t("操作")}</span></th></tr></thead>
            <tbody>{pagination.items.map((customer) => <tr key={customer.id} data-list-row={customer.id}>
              <td><ListLink capture={position.capture} row={customer.id} className="table-link" to={`/customers/${customer.id}`}>{customer.name}</ListLink></td><td>{t(typeLabels[customer.customerType])}</td><td>{customer.phone}</td><td>{customer.email ?? '—'}</td>
              <td className="customer-row-actions"><button type="button" onClick={() => openEditForm(customer)}>{t("编辑")}</button><button className="danger-button" type="button" disabled={operation.busy} onClick={() => draft.leave(() => void handleDelete(customer))}>{t(operation.busy ? '处理中…' : '删除')}</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="customers-mobile-list">{pagination.items.map((customer) => <article className="customer-card" key={customer.id} data-list-row={customer.id}>
            <strong><ListLink capture={position.capture} row={customer.id} className="table-link" to={`/customers/${customer.id}`}>{customer.name}</ListLink></strong><span>{t(typeLabels[customer.customerType])} · {customer.phone}</span><small>{customer.email ?? t('未填写邮箱')}</small>
            <div className="customer-card-actions"><button type="button" onClick={() => openEditForm(customer)}>{t("编辑")}</button><button className="danger-button" type="button" disabled={operation.busy} onClick={() => draft.leave(() => void handleDelete(customer))}>{t(operation.busy ? '处理中…' : '删除')}</button></div>
          </article>)}</div>
        </>
      ) : <DataState kind={(searchTerm || dateFilter || typeFilter) ? 'filtered' : 'empty'} title={t((searchTerm || dateFilter || typeFilter) ? '没有符合条件的结果' : '尚未有客户资料')} description={t((searchTerm || dateFilter || typeFilter) ? '试试其他条件，或清除搜索与筛选。' : '管理客户的联系人、电话与地址。')} action={(searchTerm || dateFilter || typeFilter) ? <button type="button" className="secondary-button" onClick={clearFilters}>{t("清除搜索与筛选")}</button> : <button type="button" className="primary-button" onClick={openCreateForm}>{t("新增客户")}</button>} />)}
      {resource.available && <ListPagination pagination={pagination} />}
    </main>
  )
}

function FormField({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  useLanguage()
  return <label className={wide ? 'customer-form-wide' : undefined}><span>{t(label)}</span>{children}</label>
}

function normalizeInput(input: CustomerInput): CustomerInput {
  return { ...input, name: input.name.trim(), phone: input.phone.trim(), email: input.email?.trim() || null, address: input.address?.trim() || null, notes: input.notes?.trim() || null }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '客户资料请求失败，请稍后再试。'
}
