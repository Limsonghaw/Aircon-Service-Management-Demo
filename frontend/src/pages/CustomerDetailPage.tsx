import { translate as t, useLanguage, getLocale } from '../i18n'
import { BackToList } from '../components/BackToList'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { DataState, LoadState } from '../components/DataState'
import { useResource } from '../hooks/useResource'
import { useParams } from 'react-router-dom'
import { createCustomerJob, getCustomer, getCustomerJobs, type Customer, type CustomerJob, type CustomerJobInput } from '../services/customersApi'
import { openDatePicker } from '../utils/openDatePicker'
import { useTeams } from '../hooks/useTeams'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { JobDetail } from '../components/JobDetail'
import { JobPhotos } from '../components/JobPhotos'

const statusLabels: Record<CustomerJob['status'], string> = {
  pending: '待安排',
  scheduled: '已安排',
  in_progress: '进行中',
  completed: '已完成',
}

const emptyJobForm: CustomerJobInput = {
  jobNumber: '',
  title: '',
  serviceDate: new Date().toISOString().slice(0, 10),
  team: '未安排',
  status: 'pending',
}

export function CustomerDetailPage() {
  useLanguage()
  const teamsState = useTeams()
  const { customerId } = useParams()
  const customerLoader = useCallback(() => getCustomer(customerId ?? ''), [customerId])
  const jobLoader = useCallback(() => getCustomerJobs(customerId ?? ''), [customerId])
  const customerState = useResource(customerLoader, null as Customer | null)
  const jobsState = useResource(jobLoader, [] as CustomerJob[])
  const customer = customerState.available ? customerState.data : null
  const { data: jobs, setData: setJobs } = jobsState
  const [error, setError] = useState<string | null>(null)
  const [jobForm, setJobForm] = useState<CustomerJobInput>(emptyJobForm)
  const [isJobFormOpen, setIsJobFormOpen] = useState(false)
  const [isSavingJob, setIsSavingJob] = useState(false)
  const [openedJob, setOpenedJob] = useState<{ kind: string; id: string } | null>(null)
  const [photosBusy, setPhotosBusy] = useState(false)
  const detailPanel = useRef<HTMLDivElement>(null)
  const operation = useOperation()
  const draft = useUnsaved(jobForm, isJobFormOpen, isSavingJob, customerId, setJobForm)


  async function handleCreateJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customerId || isSavingJob || operation.busy) return

    setIsSavingJob(true)
    setError(null)
    try {
      await operation.run('正在建立工作单…', '工作单已建立', () => createCustomerJob(customerId, {
        ...jobForm,
        jobNumber: jobForm.jobNumber.trim(),
        title: jobForm.title.trim(),
        team: jobForm.team.trim(),
      }), created => {
      setJobs((current) => [created, ...current])
      draft.clean(); setJobForm(emptyJobForm)
      setIsJobFormOpen(false)
      }, () => document.querySelector<HTMLFormElement>('.customer-job-form')?.requestSubmit())
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '工作单建立失败。')
    } finally {
      setIsSavingJob(false)
    }
  }

  const position = useListPosition(customerState.available && jobsState.available && !customerState.isLoading && !jobsState.isLoading && !teamsState.isLoading)
  const panels = usePanelNavigation(jobsState.available && !jobsState.isLoading, (kind, id) => {
    setOpenedJob(kind === 'view' || kind === 'photos' ? { kind, id } : null)
  }, position.capture)
  const selectedJob = jobsState.available ? jobs.find(job => job.id === openedJob?.id) : undefined
  useEffect(() => {
    if (openedJob?.kind !== 'view' || !selectedJob) return
    detailPanel.current?.focus({ preventScroll: true })
    detailPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [openedJob?.kind, selectedJob])
  const phone = customer?.phone.trim()
  const dialNumber = phone?.replace(/[^\d+]/g, '')
  const address = customer?.address?.trim()
  function openJob(kind: 'view' | 'photos', jobId: string) {
    if (photosBusy || isSavingJob || operation.busy) return
    draft.leave(() => { setIsJobFormOpen(false); panels.open(kind, jobId) })
  }
  function jobActions(job: CustomerJob) {
    return <div className="customer-card-actions">
      <button className="primary-button job-view-button" type="button" disabled={photosBusy || isSavingJob || operation.busy} onClick={() => openJob('view', job.id)}>{t("查看工作")}</button>
      <button className="secondary-button" type="button" disabled={photosBusy || isSavingJob || operation.busy} onClick={() => openJob('photos', job.id)}>{t("照片")}</button>
    </div>
  }
  if (!customer) return <main {...position.rootProps}>{t(position.restorationNotice)}<BackToList path="/customers">{t("← 返回客户")}</BackToList><LoadState state={customerState} label={t("客户详情")} /></main>

  return (
    <main {...position.rootProps}>{t(position.restorationNotice)}
      <BackToList path="/customers">{t("← 返回客户")}</BackToList>
      <div className="page-heading customer-detail-heading">
        <div><h1>{customer.name}</h1><p>{t(customer.customerType === 'business' ? '企业客户' : '个人客户')}</p></div>
      </div>

      <LoadState state={customerState} label={t("客户详情")} />
      <section className="customer-contact-card">
        <h2>{t("联络资料")}</h2>
        <dl className="customer-contact-grid">
          <div><dt>{t("联系电话")}</dt><dd>{t(phone || '未填写')}</dd></div>
          <div><dt>{t("电子邮箱")}</dt><dd>{customer.email ?? t('未填写')}</dd></div>
          <div><dt>{t("地址")}</dt><dd>{t(address || '未填写')}</dd></div>
          <div><dt>{t("备注")}</dt><dd>{customer.notes ?? t('无')}</dd></div>
        </dl>
        <div className="job-contact-actions customer-contact-actions">
          {dialNumber && /\d/.test(dialNumber) && <a className="primary-button" href={`tel:${dialNumber}`}>{t("拨打电话")}</a>}
          {address && <a className="secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener noreferrer">{t("打开地图")}</a>}
        </div>
      </section>

      <section className="customer-jobs-section">
        <div className="customer-section-heading">
          <div><h2>{t("关联工作单")}</h2><p>{t(jobsState.available ? `共 ${jobs.length} 项工作` : jobsState.isLoading ? '正在加载工作…' : '数量尚未加载')}</p></div>
          {!jobsState.restricted && <button className="primary-button" type="button" disabled={isSavingJob || photosBusy} onClick={() => draft.leave(() => { setJobForm(emptyJobForm); setIsJobFormOpen(open => !open) })}>
            {t(isJobFormOpen ? '取消' : '新增工作单')}
          </button>}
        </div>
        {error && <p className="customer-error" role="alert">{t(error)}</p>}<LoadState state={jobsState} label={t("关联工作单")} /><LoadState state={teamsState} label={t("团队资料")} />
        {isJobFormOpen && <ValidatedForm className="customer-job-form" onSubmit={handleCreateJob} aria-busy={isSavingJob}>
          <label><span>{t("工作单编号 *")}</span><input name="jobNumber" required maxLength={50} placeholder={t("例如 JOB-2026-043")} value={jobForm.jobNumber} onChange={(event) => setJobForm({ ...jobForm, jobNumber: event.target.value })} /></label>
          <label><span>{t("工作内容 *")}</span><input name="title" required maxLength={200} value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} /></label>
          <label><span>{t("服务日期 *")}</span><input name="serviceDate" required type="date" value={jobForm.serviceDate} onClick={openDatePicker} onChange={(event) => setJobForm({ ...jobForm, serviceDate: event.target.value })} /></label>
          <label><span>{t("团队 *")}</span><select name="team" required value={jobForm.team} onChange={(event) => setJobForm({ ...jobForm, team: event.target.value })}>
            <option value="未安排">{t("未安排")}</option>
            {teamsState.teams.filter((team) => team.isActive).map((team) => <option value={team.name} key={team.id}>{team.name}</option>)}
          </select></label>
          <label><span>{t("状态 *")}</span><select name="status" value={jobForm.status} onChange={(event) => setJobForm({ ...jobForm, status: event.target.value as CustomerJob['status'] })}>
            <option value="pending">{t("待安排")}</option><option value="scheduled">{t("已安排")}</option><option value="in_progress">{t("进行中")}</option><option value="completed">{t("已完成")}</option>
          </select></label>
          <div className="customer-job-form-actions"><button className="primary-button" type="submit" disabled={isSavingJob}>{t(isSavingJob ? '建立中…' : '建立工作单')}</button></div>
        </ValidatedForm>}
        {jobsState.available && (jobs.length > 0 ? (
          <><div className="jobs-table-wrap"><table className="jobs-table">
            <thead><tr><th>{t("编号")}</th><th>{t("工作内容")}</th><th>{t("服务日期")}</th><th>{t("团队")}</th><th>{t("状态")}</th><th>{t("操作")}</th></tr></thead>
            <tbody>{jobs.map((job) => <tr key={job.id} data-list-row={job.id}>
              <td>{job.jobNumber}</td><td>{job.title}</td><td>{formatDate(job.serviceDate)}</td><td>{job.team === '未安排' ? t('未安排') : job.team}</td>
              <td><span className={`badge status-${statusLabels[job.status]}`}>{t(statusLabels[job.status])}</span></td>
              <td>{jobActions(job)}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="jobs-mobile-list">{jobs.map(job => <article className="job-card" key={job.id} data-list-row={job.id}>
            <div className="job-card-heading"><strong>{job.title}</strong><span className={`badge status-${statusLabels[job.status]}`}>{t(statusLabels[job.status])}</span></div>
            <span>{job.jobNumber}</span><small>{formatDate(job.serviceDate)} · {job.team === '未安排' ? t('未安排') : job.team}</small>
            {jobActions(job)}
          </article>)}</div></>
        ) : <DataState title={t("尚未有关联工作单")} description={t("可沿用此客户建立新的工作安排。")} action={<button type="button" className="primary-button" onClick={() => setIsJobFormOpen(true)}>{t("新增工作单")}</button>} />)}
      </section>
      {selectedJob && (openedJob?.kind === 'photos'
        ? <JobPhotos key={selectedJob.id} job={selectedJob} onClose={panels.close} onBusy={setPhotosBusy} />
        : <div ref={detailPanel} tabIndex={-1} className="customer-job-detail" aria-label={t(`工作详情 ${selectedJob.jobNumber}`)}><JobDetail key={selectedJob.id} job={selectedJob} canManage={false} busy={photosBusy} onClose={panels.close} onBusy={setPhotosBusy} /></div>)}
    </main>
  )
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(`${date}T00:00:00`))
}
