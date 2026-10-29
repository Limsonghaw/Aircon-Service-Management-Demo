import { translate as t, useLanguage } from '../i18n'
import { DataState, LoadState } from '../components/DataState'
import { Link } from 'react-router-dom'
import { useFinancialData } from '../hooks/useFinancialData'
import { useJobs } from '../hooks/useJobs'
import { formatCurrency } from '../utils/formatCurrency'
import { dashboardSummary } from '../utils/dashboardSummary'
import { dashboardTasks } from '../utils/dashboardTasks'

export function DashboardPage() {
  useLanguage()
  const jobsState = useJobs()
  const { jobs, isLoading, retry } = jobsState
  const financial = useFinancialData()
  const summary = dashboardSummary(jobs, financial.invoices)
  const { today, todayJobs, overdue, unpaid } = dashboardTasks(jobs, financial.invoices)
  const pendingGroups = [
    { label: '逾期发票', count: overdue.length, unit: '笔', path: '/invoices?filter=overdue', tone: 'urgent', state: financial.invoiceState },
    { label: '待确认报价', count: financial.quotes.filter(quote => quote.status === 'sent').length, unit: '份', path: '/quotes?filter=sent', tone: 'warning', state: financial.quoteState },
    { label: '待审核费用', count: financial.expenses.filter(expense => expense.status === 'pending').length, unit: '笔', path: '/expenses?filter=pending', tone: 'review', state: financial.expenseState },
    { label: '其他待收款发票', count: unpaid.length, unit: '笔', path: '/invoices?filter=receivable', tone: 'review', state: financial.invoiceState },
  ]
  return <main className="dashboard-page">
    <div className="page-heading"><div>
      <h1>{t(!jobsState.available ? (isLoading ? '正在载入今日工作…' : '今日工作暂时无法载入') : `今天有 ${todayJobs.length} 项工作`)}</h1>
      <p>{today.replaceAll('-', '/')}{t(" · 本月完成 ")}{jobsState.available ? summary.completedThisMonth : isLoading ? '…' : '—'}{t(" 项 · 累计已收款 ")}{financial.invoiceState.available ? formatCurrency(summary.collected) : financial.invoiceState.isLoading ? '…' : '—'}</p>
    </div><button type="button" className="secondary-button" disabled={isLoading || financial.isLoading} onClick={() => { retry(); financial.retry() }}>{t("刷新资料")}</button></div>
    <div className="dashboard-grid task-dashboard-grid">
      <section aria-labelledby="pending-title"><h2 id="pending-title">{t("需要你处理")}</h2>
        <div className="dashboard-list">{pendingGroups.map(group => <div key={group.label}><LoadState state={group.state} label={t(group.label)} />{group.state.available && <Link className={`dashboard-row dashboard-row-link pending-summary ${group.tone}`} to={group.path}><strong>{t(group.label)}</strong><span>{group.count} {t(group.unit)} <span aria-hidden="true">›</span></span></Link>}</div>)}</div>
        <Link className="table-link dashboard-all-link" to="/pending">{t("查看全部待处理 →")}</Link>
      </section>
      <section aria-labelledby="today-title"><div className="dashboard-section-heading"><h2 id="today-title">{t("今日工作")}</h2><Link className="table-link" to="/calendar">{t("日历 →")}</Link></div>
        <div className="dashboard-list">
          <LoadState state={jobsState} label={t("今日工作")} />
          {jobsState.available && !todayJobs.length && <DataState title={t("今天没有工作安排")} description={t("可查看其他日期和已有工作单。")} action={<Link className="secondary-button" to="/jobs">{t("查看所有工作")}</Link>} />}
          {jobsState.available && todayJobs.map(job => <Link className="dashboard-row dashboard-row-link" to={`/jobs?view=${encodeURIComponent(job.id)}`} key={job.id}><div><strong>{job.title}</strong><small>{job.jobNumber} · {job.customerName || t('客户')} · {job.team === '未安排' ? t('未安排') : job.team}</small></div><span className={`badge status-${statusLabel(job.status)}`}>{t(statusLabel(job.status))}</span></Link>)}
        </div><Link className="table-link dashboard-all-link" to="/jobs">{t("查看全部工作单 →")}</Link>
      </section>
    </div>
    <div className="dashboard-shortcuts">{!financial.quoteState.restricted && <Link className="secondary-button" to="/quotes?create=1">{t("＋ 新增报价")}</Link>}<Link className="secondary-button" to="/customers?create=1">{t("＋ 新增客户")}</Link></div>
    <section className="stats" aria-label={t("业务指标")}><article className="stat-card"><span>{t("进行中的工作")}</span><strong>{jobsState.available ? summary.inProgress : isLoading ? '…' : '—'}</strong></article><article className="stat-card"><span>{t("尚未完成的工作")}</span><strong>{jobsState.available ? summary.activeJobs.length : isLoading ? '…' : '—'}</strong></article></section>
    <p className="schedule-note">{t("日期按马来西亚时间计算。本月完成按服务日期统计；累计已收款为全部已付款发票金额，不含部分付款，不按实际收款日期统计。")}</p>
  </main>
}
function statusLabel(status: string) {
  return { pending: '待安排', scheduled: '已安排', in_progress: '进行中', completed: '已完成' }[status] ?? status
}
