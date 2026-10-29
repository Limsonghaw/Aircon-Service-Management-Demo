import { translate as t, useLanguage, getLocale } from '../i18n'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getActivityLogPage, type ActivityLog } from '../services/activityLogsApi'

const actionLabels: Record<ActivityLog['action'], string> = {
  created: '新增',
  updated: '编辑',
  status_changed: '状态变更',
  quote_converted: '报价转换',
  document_signed: '单据签名',
  receipt_uploaded: '上传收据',
  job_photo_uploaded: '上传工作照片',
}
const entityLabels: Record<ActivityLog['entityType'], string> = {
  customer: '客户', job: '工作单', invoice: '发票', quote: '报价',
  expense: '费用', team: '团队', employee: '员工',
  owner_signature: '常用签名',
}
const statusLabels: Record<string, string> = {
  draft: '草稿', sent: '已发送', accepted: '已接受', rejected: '已拒绝',
  unpaid: '未付款', partial: '部分付款', paid: '已付款', overdue: '已逾期',
  pending: '待处理', scheduled: '已安排', in_progress: '进行中', completed: '已完成',
  confirmed: '已确认', true: '启用', false: '停用',
}

export function ActivityLogPage() {
  useLanguage()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const pageSize = [10, 20, 50].includes(Number(params.get('pageSize'))) ? Number(params.get('pageSize')) : 20
  const [total, setTotal] = useState(0)
  const [retry, setRetry] = useState(0)
  const [filters, setFilters] = useState(() => ({ search: params.get('search') || '', action: params.get('action') || '', entityType: params.get('entityType') || '', from: params.get('from') || '', to: params.get('to') || '' }))
  const invalidDates = !!(filters.from && filters.to && filters.from > filters.to)
  function changePage(nextPage: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(nextPage))
    setParams(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setLoading(true); setError('')
        setFilters({ search: params.get('search') || '', action: params.get('action') || '', entityType: params.get('entityType') || '', from: params.get('from') || '', to: params.get('to') || '' })
      }
    })
    const query = new URLSearchParams(params)
    query.set('page', String(page)); query.set('pageSize', String(pageSize))
    void getActivityLogPage(query, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
        if (page > lastPage) { query.set('page', String(lastPage)); setParams(query, { replace: true }); return }
        setLogs(result.items); setTotal(result.total)
      })
      .catch(failure => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '无法载入操作日志。') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [params, page, pageSize, retry, setParams])

  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>{t("操作日志")}</h1>
          <p>{t("查看系统中的重要资料变更与操作记录。")}</p>
        </div>
      </div>

      <form className="activity-filters" onSubmit={event => {
        event.preventDefault()
        if (invalidDates) return
        const next = new URLSearchParams()
        for (const [key, value] of Object.entries(filters)) if (value.trim()) next.set(key, value.trim())
        next.set('pageSize', String(pageSize)); next.set('page', '1'); setParams(next)
      }}>
        <label>{t("关键词")}<input type="search" maxLength={100} placeholder={t("搜索编号、名称或操作人")} value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} /></label>
        <label>{t("操作类型")}<select value={filters.action} onChange={event => setFilters({ ...filters, action: event.target.value })}><option value="">{t("全部操作")}</option>{Object.entries(actionLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label>{t("业务类别")}<select value={filters.entityType} onChange={event => setFilters({ ...filters, entityType: event.target.value })}><option value="">{t("全部类别")}</option>{Object.entries(entityLabels).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
        <label>{t("开始日期")}<input type="date" value={filters.from} onChange={event => setFilters({ ...filters, from: event.target.value })} /></label>
        <label>{t("结束日期")}<input type="date" value={filters.to} onChange={event => setFilters({ ...filters, to: event.target.value })} /></label>
        <div className="activity-filter-actions"><button className="primary-button" disabled={invalidDates}>{t("应用筛选")}</button><button type="button" className="secondary-button" onClick={() => { setFilters({ search: '', action: '', entityType: '', from: '', to: '' }); setParams({ pageSize: String(pageSize) }) }}>{t("清除筛选")}</button></div>
        {invalidDates && <p role="alert">{t("开始日期不能晚于结束日期。")}</p>}
      </form>
      {loading && <section className="activity-empty" aria-live="polite"><p>{t("正在载入操作日志…")}</p></section>}
      {error && <p className="customer-error" role="alert">{t(error)}<button type="button" onClick={() => setRetry(value => value + 1)}>{t("重试")}</button></p>}
      {!loading && !error && logs.length === 0 && <section className="activity-empty" aria-labelledby="activity-empty-title">
        <span className="activity-empty-icon" aria-hidden="true">◎</span>
        <h2 id="activity-empty-title">{t("没有符合条件的操作记录")}</h2>
        <p>{t("新增、编辑、状态变更或转换报价后，记录会显示在这里。")}</p>
      </section>}
      {!loading && !error && <p className="activity-result-count" role="status">{t("共 ")}{total}{t(" 项记录 · 第 ")}{page} / {Math.max(1, Math.ceil(total / pageSize))}{t(" 页")}</p>}
      {!loading && !error && logs.length > 0 && <ol className="activity-list">
        {logs.map((log) => <li className="activity-entry" key={log.id}>
          <span className={`activity-action activity-action-${log.action}`}>{t(actionLabels[log.action])}</span>
          <div className="activity-entry-body">
            <strong>{t(entityLabels[log.entityType])} · {t(log.entityLabel)}</strong>
            {log.action === 'status_changed' && <p>
              {t(displayStatus(log.previousStatus))} → {t(displayStatus(log.newStatus))}
            </p>}
            {log.action === 'quote_converted' && <p>{t("由已接受的报价建立")}</p>}
            <small>{log.actorName} · {formatDateTime(log.createdAt)}</small>
          </div>
        </li>)}
      </ol>}
      <nav className="activity-pagination" aria-label={t("操作日志分页")}>
        <label>{t("每页")}<select value={pageSize} onChange={event => { const next = new URLSearchParams(params); next.set('pageSize', event.target.value); next.set('page', '1'); setParams(next) }}><option value="10">{t("10 项")}</option><option value="20">{t("20 项")}</option><option value="50">{t("50 项")}</option></select></label>
        <button className="secondary-button" disabled={loading || !!error || page <= 1} onClick={() => changePage(page - 1)}>{t("上一页")}</button>
        <span>{page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
        <button className="secondary-button" disabled={loading || !!error || page >= Math.ceil(total / pageSize)} onClick={() => changePage(page + 1)}>{t("下一页")}</button>
      </nav>
    </main>
  )
}

function displayStatus(status: string | null) {
  if (!status) return '—'
  return statusLabels[status] ?? status
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(value))
}
