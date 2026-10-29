import { translate as t, useLanguage } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DataState, LoadState } from '../components/DataState'
import { useJobs } from '../hooks/useJobs'
import type { CustomerJob } from '../services/customersApi'
import { businessDate } from '../utils/dashboardTasks'
import { calendarDays, calendarDateLabel, calendarJobGroups, shiftCalendarMonth } from '../utils/calendarJobs'
import { MenuSelect } from '../components/PopupMenu'
import { JobDetail } from '../components/JobDetail'
import { JobPhotos } from '../components/JobPhotos'
import { useInteraction } from '../contexts/InteractionContext'
import './CalendarPage.css'

const statuses = { pending: '待安排', scheduled: '已安排', in_progress: '进行中', completed: '已完成' }
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

export function CalendarPage({ canViewCustomers = true }: { canViewCustomers?: boolean }) {
  useLanguage()
  const agenda = useRef<HTMLElement>(null)
  const dateButtons = useRef(new Map<string, HTMLButtonElement>())
  const resource = useJobs(true)
  const { jobs, isLoading, error, retry } = resource
  const { leave } = useInteraction()
  const [today, setToday] = useState(businessDate)
  const [visibleMonth, setVisibleMonth] = useState(() => today.slice(0, 7))
  const [selectedDate, setSelectedDate] = useState(today)
  const [team, setTeam] = useState('')
  const [status, setStatus] = useState('')
  const [openedJob, setOpenedJob] = useState<{ job: CustomerJob; photos: boolean } | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const groups = useMemo(() => calendarJobGroups(jobs, team, status), [jobs, team, status])
  const selectedJobs = groups.get(selectedDate) ?? []
  const days = calendarDays(visibleMonth)
  const teamOptions = Object.fromEntries([...new Set(jobs.map(job => job.team))].sort().map(value => [value, value]))
  const detailJob = jobs.find(job => job.id === openedJob?.job.id) ?? openedJob?.job
  const ready = resource.available

  useEffect(() => {
    const updateToday = () => setToday(businessDate())
    const interval = window.setInterval(updateToday, 60_000)
    window.addEventListener('focus', updateToday)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', updateToday) }
  }, [])

  function showAgenda() {
    agenda.current?.focus({ preventScroll: true })
    agenda.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  function selectDate(key: string) {
    if (key === selectedDate) { showAgenda(); return }
    leave(() => { setSelectedDate(key); setOpenedJob(null) })
  }

  function moveFocus(key: string, offset: number) {
    const date = new Date(`${key}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + offset)
    const next = date.toISOString().slice(0, 10)
    if (!dateButtons.current.has(next)) setVisibleMonth(next.slice(0, 7))
    requestAnimationFrame(() => dateButtons.current.get(next)?.focus({ preventScroll: true }))
  }

  return <main className="work-calendar">
    <div className="page-heading"><div><h1>{t("工作日历")}</h1><p>{t("查看每天工作数量，选择日期查看当天安排。")}</p></div>
      <button type="button" className="secondary-button" disabled={isLoading || photoBusy} onClick={retry}>{t(isLoading ? '更新中…' : '刷新工作')}</button>
    </div>
    <div className="calendar-controls"><div className="calendar-toolbar" aria-label={t("日历月份控制")}>
      <button type="button" aria-label={t("上个月")} onClick={() => setVisibleMonth(month => shiftCalendarMonth(month, -1))}>‹</button>
      <strong>{Number(visibleMonth.slice(0, 4))}{t(" 年 ")}{Number(visibleMonth.slice(5))}{t(" 月")}</strong>
      <button type="button" aria-label={t("下个月")} onClick={() => setVisibleMonth(month => shiftCalendarMonth(month, 1))}>›</button>
      <button className="today-button" type="button" onClick={() => leave(() => {
        const current = businessDate(); setToday(current); setVisibleMonth(current.slice(0, 7)); setSelectedDate(current); setOpenedJob(null)
      })}>{t("今天")}</button>
    </div>
    <div className="calendar-filters" aria-label={t("工作筛选")}>
      <div><span>{t("团队")}</span><MenuSelect label={t("日历团队")} value={team} options={{ '': '全部团队', ...teamOptions }} onChange={value => leave(() => { setTeam(value); setOpenedJob(null) })} /></div>
      <div><span>{t("状态")}</span><MenuSelect label={t("日历状态")} value={status} options={{ '': '全部状态', ...statuses }} onChange={value => leave(() => { setStatus(value); setOpenedJob(null) })} /></div>
      {(team || status) && <button type="button" className="text-button" onClick={() => leave(() => { setTeam(''); setStatus(''); setOpenedJob(null) })}>{t("清除筛选")}</button>}
    </div></div>
    <div className="calendar-interaction-hint"><p>{t("点击选择日期；再次点击选中日期，跳到当天安排。")}<span className="calendar-keyboard-hint">{t("键盘可用方向键移动、Enter 选择。")}</span></p>
      <button type="button" className="secondary-button" onClick={showAgenda}>{t("查看当天工作 ↓")}</button></div>
    <LoadState state={resource} label={t("工作数量与安排")} />
    <div className="calendar-layout">
      <section className="calendar-panel" aria-label={t("月份日历")} aria-busy={isLoading}>
        <div className="calendar-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{t("周")}{t(day)}</span>)}</div>
        <div className="calendar-grid">{days.map(key => {
          const count = groups.get(key)?.length ?? 0
          const classes = [key.slice(0, 7) !== visibleMonth ? 'outside-month' : '', key === selectedDate ? 'selected' : '', key === today ? 'today' : ''].filter(Boolean).join(' ')
          return <button key={key} ref={element => { if (element) dateButtons.current.set(key, element); else dateButtons.current.delete(key) }} className={classes}
            type="button" data-date={key} aria-pressed={key === selectedDate} aria-current={key === today ? 'date' : undefined}
            aria-controls="calendar-agenda" aria-label={`${t(calendarDateLabel(key))}${key === today ? t('，今天') : ''}, ${t(ready ? `${count}项工作` : error ? '工作数量未能载入' : '工作数量载入中')}`}
            onClick={() => selectDate(key)} onKeyDown={event => {
              const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
              const offset = offsets[event.key]
              if (offset !== undefined) { event.preventDefault(); moveFocus(key, offset) }
            }}>
            <span className="calendar-day-number">{Number(key.slice(8))}</span>
            {ready && count > 0 && <span className="calendar-job-count" aria-hidden="true"><span>{count}{t(" 项")}</span><span className="calendar-count-unit">{t("工作")}</span></span>}
          </button>
        })}</div>
        <div className="calendar-legend"><span><i className="calendar-today-marker" />{t("今天")}</span><span><i className="calendar-selected-marker" />{t("选中日期")}</span><span>{t("数量按服务日期统计")}</span></div>
      </section>
      <section ref={agenda} id="calendar-agenda" tabIndex={-1} className="calendar-agenda" aria-labelledby="agenda-title" aria-busy={isLoading}>
        <h2 id="agenda-title">{t(calendarDateLabel(selectedDate))} · {t(ready ? `${selectedJobs.length} 项工作` : error ? '数量未能载入' : '正在载入')}</h2>
        {!ready ? <LoadState state={resource} label={t("当天安排")} /> : selectedJobs.length === 0 ? <DataState kind={team || status ? 'filtered' : 'empty'} title={t(team || status ? '没有符合条件的结果' : '当天没有工作安排')} description={t(team || status ? '当天在当前筛选条件下没有工作。' : '可选择其他日期查看工作。')} action={(team || status) && <button type="button" className="secondary-button" onClick={() => leave(() => { setTeam(''); setStatus(''); setOpenedJob(null) })}>{t("清除搜索与筛选")}</button>} /> :
          <div className="agenda-list">{selectedJobs.map(job => <article className="calendar-job-card" key={job.id}>
            <div className="calendar-job-heading"><strong>{job.title}</strong><span className={`badge status-${statuses[job.status]}`}>{t(statuses[job.status])}</span></div>
            <small>{job.jobNumber} · {canViewCustomers ? <Link to={`/customers/${job.customerId}`}>{job.customerName || t('查看客户')}</Link> : job.customerName || '—'} · {job.team === '未安排' ? t('未安排') : job.team}</small>
            <div className="calendar-job-actions"><button type="button" className="primary-button" disabled={photoBusy} onClick={() => leave(() => setOpenedJob({ job, photos: false }))}>{t("查看工作")}</button>
              <button type="button" className="secondary-button" disabled={photoBusy} onClick={() => leave(() => setOpenedJob({ job, photos: true }))}>{t("照片")}</button></div>
          </article>)}</div>}
        {detailJob && (openedJob?.photos ? <JobPhotos key={detailJob.id} job={detailJob} onClose={() => setOpenedJob(null)} onBusy={setPhotoBusy} /> :
          <JobDetail key={detailJob.id} job={detailJob} canManage={canViewCustomers} busy={photoBusy} onClose={() => setOpenedJob(null)} onBusy={setPhotoBusy} />)}
      </section>
    </div>
  </main>
}
