import { translate as t, useLanguage } from '../i18n'
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createCustomerJob, getCustomers, type Customer, type CustomerJob } from '../services/customersApi'
import { useResource } from '../hooks/useResource'
import { useTeams } from '../hooks/useTeams'
import { useCustomerPicker } from '../hooks/useCustomerPicker'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { openDatePicker } from '../utils/openDatePicker'
import { ValidatedForm } from './ValidatedForm'
import { DataState, LoadState } from './DataState'

export function CreateJobForm({ onSaved, onCancel }: { onSaved: (job: CustomerJob) => void; onCancel: () => void }) {
  useLanguage()
  const [form, setForm] = useState({ customerId: '', title: '', serviceDate: '', team: '未安排' })
  // Keep the same number on retries; no database sequence or migration is needed.
  const [jobNumber] = useState(() => `JOB-${Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`)
  const [query, setQuery] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const picker = useCustomerPicker(pickerOpen, setPickerOpen)
  const customers = useResource(getCustomers, [] as Customer[])
  const teams = useTeams()
  const operation = useOperation()
  const panelElement = useRef<HTMLElement>(null)
  const [error, setError] = useState('')
  const draft = useUnsaved({ form, query }, true, operation.busy, jobNumber, initial => { setForm(initial.form); setQuery(initial.query) })
  const matches = customers.data.filter(customer => [customer.name, customer.phone, customer.email ?? '']
    .some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (operation.busy || !customers.available || teams.restricted) return
    const customer = customers.data.find(item => item.id === form.customerId)
    if (!customer) { setError('请从搜索结果中选择客户。'); return }
    if (!form.title.trim()) { setError('请填写工作内容。'); return }
    setError('')
    try {
      await operation.run('正在建立工作单…', '工作单已建立', () => createCustomerJob(customer.id, {
        jobNumber, title: form.title.trim(), serviceDate: form.serviceDate, team: form.team, status: 'pending',
      }), saved => { draft.clean(); onSaved({ ...saved, customerName: customer.name }) },
      () => panelElement.current?.querySelector('form')?.requestSubmit())
    } catch (failure) {
      customers.blockAccess(failure)
      setError(failure instanceof Error ? failure.message : '建立失败，请重试。')
    }
  }

  return <section ref={panelElement} className="job-edit-panel direct-job-create" aria-labelledby="create-job-heading">
    <div className="customer-form-heading"><h2 id="create-job-heading">{t("直接新增工作单")}</h2>
      <button type="button" className="text-button" disabled={operation.busy} onClick={() => draft.leave(onCancel)}>{t("取消")}</button></div>
    <p>{t("选择客户即可建立，无需先开报价。编号自动生成，初始状态为「待安排」。")}</p>
    <LoadState state={customers} label={t("客户资料")} />
    <LoadState state={teams} label={t("团队资料")} />
    {customers.available && !customers.data.length && <DataState title={t("请先建立客户资料")} description={t("建立客户后即可直接新增工作单。")} action={<Link className="secondary-button" to="/customers?create=1">{t("新增客户")}</Link>} />}
    {error && <p className="customer-error" role="alert">{t(error)}</p>}
    <ValidatedForm onSubmit={submit} aria-busy={operation.busy}>
      <fieldset className="quote-form-fields" disabled={operation.busy}>
        <div className="customer-job-form">
          <div className="invoice-customer-field" ref={picker}>
            <label htmlFor="job-customer-search">{t("客户 *")}</label>
            <div className="invoice-customer-combobox">
              <input id="job-customer-search" name="customerId" type="search" role="combobox" required autoComplete="off"
                data-selection-valid={!!form.customerId} aria-autocomplete="list" aria-expanded={pickerOpen} aria-controls="job-customer-results"
                placeholder={t("输入姓名、电话或邮箱搜索")} value={query} onFocus={() => setPickerOpen(true)}
                onChange={event => { setQuery(event.target.value); setForm({ ...form, customerId: '' }); setPickerOpen(true) }} />
              {pickerOpen && <div className="invoice-customer-results" id="job-customer-results" role="listbox">
                {!customers.available ? <p>{t("请先载入客户资料")}</p> : matches.length ? matches.map(customer => <button type="button" role="option" key={customer.id}
                  aria-selected={form.customerId === customer.id} onClick={() => { setForm({ ...form, customerId: customer.id }); setQuery(customer.name); setPickerOpen(false) }}>
                  <strong>{customer.name}</strong><small>{[customer.phone, customer.email].filter(Boolean).join(' · ')}</small>
                </button>) : <p>{t("没有符合条件的客户")}</p>}
              </div>}
            </div>
            <small aria-live="polite">{t(form.customerId ? `已选择：${query}` : '请从搜索结果中选择客户')}</small>
          </div>
          <label><span>{t("工作内容 *")}</span><input name="title" required maxLength={200} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
          <label><span>{t("服务日期 *")}</span><input name="serviceDate" type="date" required value={form.serviceDate} onClick={openDatePicker} onChange={event => setForm({ ...form, serviceDate: event.target.value })} /></label>
          <label><span>{t("团队")}</span><select name="team" value={form.team} onChange={event => setForm({ ...form, team: event.target.value })}>
            <option value="未安排">{t("未安排")}</option>{teams.teams.filter(team => team.isActive).map(team => <option key={team.id} value={team.name}>{team.name}</option>)}
          </select></label>
          <div className="customer-job-form-actions"><button type="submit" className="primary-button" disabled={operation.busy || !customers.available || !customers.data.length || teams.restricted}>
            {t(operation.busy ? '正在建立…' : '建立工作单')}</button></div>
        </div>
      </fieldset>
    </ValidatedForm>
  </section>
}
