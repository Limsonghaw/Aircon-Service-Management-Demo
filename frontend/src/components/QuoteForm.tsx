import { translate as t, useLanguage } from '../i18n'
import { PdfItemImport } from './PdfItemImport'
import { ReferenceDocuments } from './ReferenceDocuments'
import { usePdfImport } from '../hooks/usePdfImport'
import { useCustomerPicker } from '../hooks/useCustomerPicker'
import { DataState, LoadState } from './DataState'
import { Link } from 'react-router-dom'
import { useResource } from '../hooks/useResource'
import { useState, type FormEvent } from 'react'
import { ValidatedForm } from './ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { getCustomers, type Customer } from '../services/customersApi'
import { itemSubtotal, quoteStatusLabels, saveQuote, type Quote, type QuoteInput, type QuoteStatus } from '../services/quotesApi'
import { formatCurrency } from '../utils/formatCurrency'
import { openDatePicker } from '../utils/openDatePicker'

export function QuoteForm({ quote, onSaved, onCancel }: { quote?: Quote; onSaved: (quote: Quote) => void; onCancel: () => void }) {
  useLanguage()
  const [form, setForm] = useState<QuoteInput>(() => quote ? { ...quote, items: quote.items.map(item => ({ ...item })) } : {
    quoteNumber: '', customerId: '', validUntil: '', status: 'draft', notes: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
  })
  const pdfImport = usePdfImport<Quote>('quote')
  const retainedItems = form.items.filter(item => item.description !== '' || item.quantity !== 1 || item.unitPrice !== 0)
  const customerState = useResource(getCustomers, [] as Customer[])
  const { data: customers, isLoading: loading } = customerState
  const [query, setQuery] = useState(quote?.customerName ?? '')
  const [isCustomerListOpen, setIsCustomerListOpen] = useState(false)
  const customerPicker = useCustomerPicker(isCustomerListOpen, setIsCustomerListOpen)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const operation = useOperation()
  const draft = useUnsaved({ form, query }, true, saving, quote?.id, initial => { setForm(initial.form); setQuery(initial.query) })
  const matches = customers.filter(customer => [customer.name, customer.phone, customer.email ?? '']
    .some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const selected = customers.find(customer => customer.id === form.customerId)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || operation.busy || pdfImport.recognizing) return
    if (!form.customerId) { setError('请选择客户。'); return }
    setSaving(true)
    setError('')
    try { await operation.run('正在保存报价…', '报价已保存', () => pdfImport.save(() => saveQuote(quote?.id ?? null, form)), saved => { draft.clean(); onSaved(saved) },
      () => document.querySelector<HTMLFormElement>('.quote-form-fields')?.closest('form')?.requestSubmit()) }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存失败。') }
    finally { setSaving(false) }
  }
  return <section className="invoice-form-panel">
    <LoadState state={customerState} label={t("客户资料")} />
    {customerState.available && !customers.length && <DataState title={t("请先建立客户资料")} description={t("报价需要关联客户，建立客户后即可继续。")} action={<Link className="secondary-button" to="/customers?create=1">{t("新增客户")}</Link>} />}
    <div className="customer-form-heading"><h2>{t(quote ? '编辑报价' : '新增报价')}</h2>
      <button type="button" className="text-button" disabled={saving} onClick={() => draft.leave(onCancel)}>{t("取消")}</button></div>
    {error && <p role="alert" className="customer-error">{t(error)}</p>}
    {!quote && <PdfItemImport selection={pdfImport.selection} documentSaved={!!pdfImport.saved} onSelect={pdfImport.select} busy={pdfImport.recognizing} onBusy={pdfImport.setRecognizing} locked={saving || !!pdfImport.saved}
      capacity={100 - retainedItems.length} onApply={items => setForm(current => ({ ...current, items: [...current.items.filter(item => item.description !== '' || item.quantity !== 1 || item.unitPrice !== 0), ...items] }))} />}
    {quote && <ReferenceDocuments kind="quote" documentId={quote.id} />}
    {pdfImport.saved && <p role="status">{t("报价已建立。若参考原件上传未完成，请重试；新单内容已锁定，避免重复开单。")}</p>}
    <ValidatedForm onSubmit={event => submit(event)} aria-busy={saving}>
      <fieldset className="quote-form-fields" disabled={saving || pdfImport.recognizing || !!pdfImport.saved}>
        <div className="invoice-form">
          <label>{t("报价编号")}<input name="quoteNumber" required maxLength={50} value={form.quoteNumber} onChange={e => setForm({ ...form, quoteNumber: e.target.value })} /></label>
          <label>{t("有效期至")}<input name="validUntil" type="date" required value={form.validUntil} onClick={openDatePicker} onChange={e => setForm({ ...form, validUntil: e.target.value })} /></label>
          <div
            className="invoice-form-wide invoice-customer-field"
            ref={customerPicker}
          >
            <label htmlFor="quote-customer-search">{t("客户")}</label>
            <div className="invoice-customer-combobox">
              <input
                id="quote-customer-search"
                name="customerId"
                data-selection-valid={!!form.customerId}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={isCustomerListOpen}
                aria-controls="quote-customer-results"
                required
                autoComplete="off"
                placeholder={t("输入姓名、电话或邮箱搜索")}
                value={query}
                onFocus={() => setIsCustomerListOpen(true)}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setForm({ ...form, customerId: '' })
                  setIsCustomerListOpen(true)
                }}
              />
              {isCustomerListOpen && (
                <div className="invoice-customer-results" id="quote-customer-results" role="listbox">
                  {loading ? <p>{t("正在加载客户…")}</p> : matches.length ? matches.map(customer => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={form.customerId === customer.id}
                      key={customer.id}
                      onClick={() => {
                        setForm({ ...form, customerId: customer.id })
                        setQuery(customer.name)
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
            <small className="quote-selected-customer" aria-live="polite">
              {t(selected ? `已选择：${selected.name} · ${selected.phone}` : '请从搜索结果中选择客户')}
            </small>
          </div>
          <label>{t("状态")}<select name="status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as QuoteStatus })}>
            {Object.entries(quoteStatusLabels).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}
          </select></label>
          <label className="invoice-form-wide">{t("备注")}<textarea name="notes" maxLength={5000} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        </div>
        <h3>{t("报价项目")}</h3>
        {form.items.map((item, index) => <div className="invoice-form quote-edit-item" key={index}>
          <label className="invoice-form-wide">{t("项目 ")}{index + 1}{t(" 说明")}<input name={`items.${index}.description`} required maxLength={1000} value={item.description}
            onChange={e => setForm({ ...form, items: form.items.map((row, i) => i === index ? { ...row, description: e.target.value } : row) })} /></label>
          <label>{t("数量")}<input name={`items.${index}.quantity`} required type="number" min="0.01" max="1000000" step="0.01" value={item.quantity || ''}
            onChange={e => setForm({ ...form, items: form.items.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row) })} /></label>
          <label>{t("单价（RM）")}<input name={`items.${index}.unitPrice`} required type="number" min="0" max="9999999999.99" step="0.01" value={item.unitPrice}
            onChange={e => setForm({ ...form, items: form.items.map((row, i) => i === index ? { ...row, unitPrice: Number(e.target.value) } : row) })} /></label>
          <span>{t("小计：")}{formatCurrency(itemSubtotal(item))}</span>
          <button className="text-button" type="button" disabled={form.items.length === 1} onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== index) })}>{t("移除项目 ")}{index + 1}</button>
        </div>)}
        <button className="secondary-button" type="button" disabled={form.items.length >= 100} onClick={() => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unitPrice: 0 }] })}>{t("＋ 添加项目")}</button>
        <div className="quote-total"><span>{t("报价总计")}</span><strong>{formatCurrency(form.items.reduce((sum, item) => sum + itemSubtotal(item), 0))}</strong></div>
      </fieldset>
      <div className="quote-save-actions"><button className="primary-button" type="submit" disabled={saving || pdfImport.recognizing || loading || !customers.length}>{t(saving ? '保存中…' : pdfImport.saved ? '重试保存参考原件' : '保存报价')}</button></div>
    </ValidatedForm>
  </section>
}
