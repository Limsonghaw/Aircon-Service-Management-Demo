import { translate as t, useLanguage } from '../i18n'
import { useUnsaved } from '../hooks/useUnsaved'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getCustomer, type Customer } from '../services/customersApi'
import type { Invoice } from '../services/invoicesApi'
import type { Quote } from '../services/quotesApi'
import './DocumentPreview.css'
import { DocumentSigning } from './DocumentSigning'
import {
  getCompanyProfile,
  type CompanyProfile,
} from '../services/companyProfileApi'

type Props = ({ kind: 'quote'; quote: Quote } | { kind: 'invoice'; invoice: Invoice }) & { onClose: () => void; customerData?: Customer }
const money = (value: number) => value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DocumentPreview(props: Props) {
  useLanguage()
  const { onClose, customerData } = props
  const record = props.kind === 'quote' ? props.quote : props.invoice
  const [customer, setCustomer] = useState<Customer | null>(customerData ?? null)
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null)
  const [error, setError] = useState('')
  const [term, setTerm] = useState('')
  const [reference, setReference] = useState('')
  const [attention, setAttention] = useState('')
  const [serviceMan, setServiceMan] = useState('')
  const [signingBusy, setSigningBusy] = useState(false)
  const [date, setDate] = useState(() => props.kind === 'invoice' ? props.invoice.createdAt.slice(0, 10) : localDate())
  useUnsaved({ date, reference, attention, term, serviceMan }, true, signingBusy, record.id, initial => { setDate(initial.date); setReference(initial.reference); setAttention(initial.attention); setTerm(initial.term); setServiceMan(initial.serviceMan) })
  useEffect(() => {
    let cancelled = false

    void getCompanyProfile()
      .then(profile => {
        if (!cancelled) {
          setCompanyProfile(profile)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to load company profile.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [])
  useEffect(() => {
    const previousTitle = document.title
    let cancelled = false
    if (!customerData) void getCustomer(record.customerId).then((result) => { if (!cancelled) setCustomer(result) })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : '客户资料载入失败。') })
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && !signingBusy) onClose() }
    document.addEventListener('keydown', close)
    return () => { cancelled = true; document.title = previousTitle; document.removeEventListener('keydown', close) }
  }, [record.customerId, onClose, customerData, signingBusy])
  const isQuote = props.kind === 'quote'
  const number = props.kind === 'quote' ? props.quote.quoteNumber : props.invoice.invoiceNumber
  const total = props.kind === 'quote' ? props.quote.total : props.invoice.amount
  const discount = props.kind === 'invoice' ? props.invoice.discount : 0
  const items = props.kind === 'quote' ? props.quote.items : (props.invoice.items?.length ? props.invoice.items : [{ description: props.invoice.notes || 'Air-conditioning service', quantity: 1, unitPrice: total }])
  return createPortal(<div className="document-overlay" role="dialog" aria-modal="true" aria-label={t("单据打印预览")}>
    <div className="document-controls">
      <strong>{t(isQuote ? '报价单' : '发票')}{t(" · 普通 PDF 预览（无签名）")}</strong>
      <fieldset className="document-field-controls" disabled={signingBusy}>
        <label>{t("日期")}<input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Ref / PO<input maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)} /></label>
        <label>Attn<input maxLength={100} value={attention} onChange={(e) => setAttention(e.target.value)} /></label>
        {isQuote ? <label>{t("付款条款")}<input maxLength={200} placeholder={t("例如 30 days")} value={term} onChange={(e) => setTerm(e.target.value)} /></label>
          : <label>{t("服务人员")}<input maxLength={100} value={serviceMan} onChange={(e) => setServiceMan(e.target.value)} /></label>}
      </fieldset>
      <button className="primary-button" disabled={!customer || !companyProfile || !date || signingBusy} onClick={() => { document.title = `${isQuote ? 'Quote' : 'Invoice'}-${number}`; window.print() }}>{t("普通 PDF（无签名） / 打印")}</button>
      <button className="secondary-button" disabled={signingBusy} onClick={props.onClose}>{t("关闭")}</button>
      <p>{t("普通 PDF 不含老板签名，打印目标选择“另存为 PDF”。需要签名时，请在下方生成或下载「老板签名版 PDF」。")}</p>
      {error && <p role="alert">{t(error)}</p>}
      {customer && <DocumentSigning kind={props.kind} record={record} customer={customer}
        fields={{ date, reference, attention, term, serviceMan }} onBusy={setSigningBusy} />}
    </div>
    <article className={`business-document ${isQuote ? 'document-quote' : 'document-invoice'}`}>
      <header className="document-letterhead">
        {!isQuote && <h2>Invoice / Cash Sale</h2>}

        {companyProfile ? (
          <>
            <h1>{companyProfile.chineseName}</h1>
            <h2>{companyProfile.englishName}</h2>

            <p>({companyProfile.registrationNumber})</p>

            <p>
              {companyProfile.addressLine1}
              <br />
              {companyProfile.addressLine2}
            </p>

            <p>
              TEL/FAX: {companyProfile.phone}
              &nbsp; H/P: {companyProfile.mobile}
            </p>

            <p>{companyProfile.chineseDescription}</p>
            <p>{companyProfile.englishDescription}</p>
          </>
        ) : (
          <p>Loading company profile...</p>
        )}
      </header>
      <div className="document-parties">
        <div><strong>To: {customer?.name ?? record.customerName}</strong><p className="document-preserve">{customer?.address}</p><p>Tel: {customer?.phone}</p>{customer?.email && <p>{customer.email}</p>}{attention && <p>Attn: {attention}</p>}</div>
        <div><p>{isQuote ? 'Ref' : 'Bill No.'}: <strong>{number}</strong></p><p>Date: {date}</p>{reference && <p>Ref / PO: {reference}</p>}<p>{isQuote ? 'Valid until' : 'Due date'}: {props.kind === 'quote' ? props.quote.validUntil : props.invoice.dueDate}</p></div>
      </div>
      {isQuote && <><h3>QUOTATION</h3><p>We are pleased to quote you the following:</p></>}
      <table className="document-items"><thead><tr><th>No.</th><th>{isQuote ? 'Description' : 'Materials Supplied / Work Description'}</th><th>Quantity</th><th>Unit Price RM</th><th>Amount RM</th></tr></thead>
        <tbody>{items.map((item, i) => <tr key={i}><td>{i + 1}</td><td className="document-preserve">{item.description}</td><td>{item.quantity}</td><td>{money(item.unitPrice)}</td><td>{money(Math.round((item.quantity * item.unitPrice + Number.EPSILON) * 100) / 100)}</td></tr>)}</tbody>
      </table>
      <div className="document-totals">{discount > 0 && <><p>Subtotal RM <strong>{money(total + discount)}</strong></p><p>Discount RM <strong>{money(discount)}</strong></p></>}<p>TOTAL RM <strong>{money(total)}</strong></p></div>
      {isQuote && term && <p>Term: {term}</p>}
      {record.notes && <div className="document-notes"><strong>Remarks:</strong><p className="document-preserve">{record.notes}</p></div>}
      {isQuote && <p className="document-closing">We hope our quotation meets your requirements and look forward to serving you. For further information, please contact us.</p>}
      <footer className="document-signatures"><div><div>{isQuote ? <><p>Yours faithfully,</p><p>{companyProfile?.englishName ?? ''}</p></> : <p>Service Man:</p>}</div><div><div className="document-signature-space" /><div className="document-sign-line" />{isQuote ? (companyProfile?.representativeName ?? '') : serviceMan}</div></div><div><div><p>{t(isQuote ? 'Kindly sign and chop to confirm the above quotation.' : "Customer’s Signature / 公司盖章")}</p></div><div><div className="document-signature-space" /><div className="document-sign-line" />{customer?.name ?? record.customerName}</div></div></footer>
    </article>
  </div>, document.body)
}

function localDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
