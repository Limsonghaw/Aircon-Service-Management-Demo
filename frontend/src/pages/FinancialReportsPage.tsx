import { translate as t, useLanguage } from '../i18n'
import { useMemo, useState } from 'react'
import { useFinancialData } from '../hooks/useFinancialData'
import { formatCurrency } from '../utils/formatCurrency'
import { openDatePicker } from '../utils/openDatePicker'
import { financialReport } from '../utils/financialReport'

export function FinancialReportsPage() {
  useLanguage()
  const { invoices, expenses, quotes, isLoading, error, retry } = useFinancialData()
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const report = useMemo(() => financialReport(invoices, expenses, quotes, dateFrom, dateTo),
    [dateFrom, dateTo, expenses, invoices, quotes])

  const stats = [
    { label: '已开票总额', value: report.invoiced },
    { label: '已收款（按已付款状态）', value: report.collected },
    { label: '待收款（不含部分付款）', value: report.outstanding },
    { label: '已确认费用', value: report.confirmedExpenses },
    { label: '待检查费用', value: report.pendingExpenses },
    { label: '净现金（估算）', value: report.netCash },
    { label: '已接受报价', value: report.acceptedQuotes },
  ]

  return <main>
    <div className="page-heading"><div><h1>{t("财务报表")}</h1><p>{t("根据真实报价、发票和费用资料汇总。")}</p></div></div>

    <section className="report-filter" aria-labelledby="report-filter-title">
      <div><h2 id="report-filter-title">{t("报表期间")}</h2><p>{t("留空表示不限日期。")}</p></div>
      <div className="report-date-fields">
        <label>{t("开始日期")}<input type="date" value={dateFrom} onClick={openDatePicker} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>{t("结束日期")}<input type="date" min={dateFrom || undefined} value={dateTo} onClick={openDatePicker} onChange={(event) => setDateTo(event.target.value)} /></label>
        {(dateFrom || dateTo) && <button className="text-button" type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>{t("清除日期")}</button>}
      </div>
    </section>

    {report.invalidRange && <p className="customer-error" role="alert">{t("开始日期不能晚于结束日期，请调整报表期间。")}</p>}
    {error && <p className="customer-error" role="alert">{t(error)}<button type="button" onClick={retry}>{t("重试")}</button></p>}
    {isLoading ? <p className="empty-state" role="status">{t("正在计算财务报表…")}</p> : !error && !report.invalidRange && <>
      <section className="stats" aria-label={t("财务指标")}>
        {stats.map((stat) => <article className="stat-card" key={stat.label}><span>{t(stat.label)}</span><strong>{formatCurrency(stat.value)}</strong></article>)}
      </section>
      <section className="report-notes" aria-labelledby="calculation-notes-title">
        <h2 id="calculation-notes-title">{t("计算说明")}</h2>
        <ul>
          <li>{t("发票按建立日期筛选；费用按费用日期筛选；报价按有效期筛选。")}</li>
          <li>{t("待收款计算“未付款”和“逾期”发票；部分付款因没有已付金额，暂不计入。")}</li>
          <li>{t("已收款仅汇总筛选范围内状态为“已付款”的发票全额；没有实际收款金额和收款日期，不能表示期间实际收款。")}</li>
          <li>{t("净现金仅为上述已付款发票金额减去已确认费用的估算；费用确认也不代表实际付款，不等同于实际现金流或会计利润。")}</li>
        </ul>
      </section>
    </>}
  </main>
}
