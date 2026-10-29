import { translate as t, useLanguage } from '../i18n'
import { stableListSort } from '../utils/listSort'
import { ListLink } from '../components/ListLink'
import { useListPosition, usePanelNavigation } from '../hooks/useListPosition'
import { useResource } from '../hooks/useResource'
import { DataState, LoadState } from '../components/DataState'
import { useClearListFilters } from '../hooks/useListPagination'
import { ActionMenu } from '../components/ActionMenu'
import { ValidatedForm } from '../components/ValidatedForm'
import { useUnsaved } from '../hooks/useUnsaved'
import { useOperation } from '../hooks/useOperation'
import { useInteraction } from '../contexts/InteractionContext'
import { ListPagination } from '../components/ListPagination'
import { ListToolbar } from '../components/ListToolbar'
import { matchesListDate, dateOptions } from '../utils/listDateFilter'
import { useListPagination, useListParam } from '../hooks/useListPagination'
import { JobDetail } from '../components/JobDetail'
import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteJob, getJobs, type CustomerJob, type CustomerJobInput, updateJob } from '../services/customersApi'
import { openDatePicker } from '../utils/openDatePicker'
import { useTeams } from '../hooks/useTeams'
import { JobPhotos } from '../components/JobPhotos'
import { CreateJobForm } from '../components/CreateJobForm'

type SortOption = 'closest' | 'newest' | 'earliest' | 'latest'
type StatusFilter = 'all' | CustomerJob['status']

const statusLabels: Record<CustomerJob['status'], string> = {
  pending: '待安排', scheduled: '已安排', in_progress: '进行中', completed: '已完成',
}

export function JobsPage({ canManage = true }: { canManage?: boolean }) {
  useLanguage()
  const [viewJobId, setViewJobId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const teamsState = useTeams(canManage)
  const [photoJobId, setPhotoJobId] = useState<string | null>(null)
  const [photosBusy, setPhotosBusy] = useState(false)
  const resource = useResource(getJobs, [] as CustomerJob[])
  const { data: jobs, setData: setJobs, isLoading: isLoading } = resource
  const clearFilters = useClearListFilters()
  const [searchTerm, setSearchTerm] = useListParam('q')
  const [dateFilter, setDateFilter] = useListParam('date')
  const [statusFilterValue, setStatusFilter] = useListParam('status', 'all')
  const statusFilter = statusFilterValue as StatusFilter
  const [teamFilter, setTeamFilter] = useListParam('team')
  const [sortValue, setSortOption] = useListParam('sort', 'closest')
  const sortOption = sortValue as SortOption
  const [editingJob, setEditingJob] = useState<CustomerJob | null>(null)
  const [form, setForm] = useState<CustomerJobInput | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = useOperation()
  const interaction = useInteraction()
  const draft = useUnsaved(form, !!editingJob, isSaving, editingJob?.id, setForm)


  const viewedJob = jobs.find(job => job.id === viewJobId)
  const photoJob = jobs.find(job => job.id === photoJobId)

  const filteredJobs = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return stableListSort(jobs.filter((job) => {
      const matchesSearch = [job.jobNumber, job.customerName ?? '', job.title]
        .some((value) => value.toLocaleLowerCase().includes(query))
      return matchesListDate(job.serviceDate, dateFilter) && matchesSearch && (statusFilter === 'all' || job.status === statusFilter) && (!teamFilter || job.team === teamFilter)
    }), (a, b) => {
      if (sortOption === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      const first = new Date(`${a.serviceDate}T00:00:00`).getTime()
      const second = new Date(`${b.serviceDate}T00:00:00`).getTime()
      return sortOption === 'earliest' ? first - second : sortOption === 'latest' ? second - first : Math.abs(first - today.getTime()) - Math.abs(second - today.getTime())
    })
  }, [jobs, searchTerm, sortOption, statusFilter, teamFilter, dateFilter])

  const pagination = useListPagination(filteredJobs, resource.available && !isLoading)
  const position = useListPosition(resource.available && !isLoading && !teamsState.isLoading)
  function showEdit(job: CustomerJob) {
    setViewJobId(null)
    setEditingJob(job)
    window.requestAnimationFrame(() => document.querySelector('.job-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    setForm({ jobNumber: job.jobNumber, title: job.title, serviceDate: job.serviceDate, team: job.team, status: job.status })
    setError(null)
  }
  const panels = usePanelNavigation(resource.available, (kind, id) => {
    setViewJobId(null); setPhotoJobId(null); setEditingJob(null); setForm(null)
    setCreating(kind === 'create' && canManage)
    if (kind === 'create' && canManage) {
      requestAnimationFrame(() => document.querySelector('.job-edit-panel')?.scrollIntoView({ block: 'start' }))
      return
    }
    const job = jobs.find(item => item.id === id)
    if (!job) return
    if (kind === 'edit' && canManage) showEdit(job)
    else if (kind === 'photos') setPhotoJobId(id)
    else if (kind === 'view') {
      setViewJobId(id)
      requestAnimationFrame(() => document.querySelector('.job-detail-panel')?.scrollIntoView({ block: 'start' }))
    }
  }, position.capture, resource.retry)
  function closePanel() {
    setCreating(false); setViewJobId(null); setPhotoJobId(null); setEditingJob(null); setForm(null); panels.close()
  }

  function startEdit(job: CustomerJob) { draft.leave(() => panels.open('edit', job.id)) }


  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingJob || !form || isSaving || operation.busy) return
    setIsSaving(true)
    setError(null)
    try {
      await operation.run('正在保存工作单…', '工作单已保存', () => updateJob(editingJob.id, form), updated => {
      setJobs((current) => current.map((job) => job.id === updated.id ? { ...updated, customerName: editingJob.customerName } : job))
      draft.clean(); closePanel()
      }, () => document.querySelector<HTMLFormElement>('.customer-job-form')?.requestSubmit())
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(job: CustomerJob) {
    if (operation.busy || !await interaction.confirm('删除工作单', `确定要删除工作单“${job.jobNumber}”吗？`, '删除')) return
    setError(null)
    try {
      await operation.run('正在删除工作单…', '工作单已删除', () => deleteJob(job.id), () => {
      setError(null)
      setJobs((current) => current.filter((item) => item.id !== job.id))
      if (viewJobId === job.id) setViewJobId(null)
      if (editingJob?.id === job.id) { draft.clean(); setEditingJob(null); setForm(null) }
      })
    } catch (requestError) { resource.blockAccess(requestError);
      setError(errorMessage(requestError))
    }
  }

  return <main {...position.rootProps} className="jobs-page unified-list-page">{t(position.restorationNotice)}
    <div className="page-heading"><div><h1>{t(canManage ? '工作单' : '我的工作')}</h1><p>{t(canManage ? '跟进真实工作状态、日期与施工团队。' : '查看分配给你所在团队的工作。')}</p></div><div className="jobs-heading-actions">{canManage && <button type="button" className="primary-button" disabled={!resource.available || photosBusy || operation.busy || creating} onClick={() => draft.leave(() => panels.open('create'))}>{t("＋ 直接新增工作单")}</button>}<button type="button" className="secondary-button" disabled={isLoading} onClick={resource.retry}>{t("刷新资料")}</button></div></div>
    {canManage && creating && <CreateJobForm onCancel={closePanel} onSaved={job => { setJobs(current => [job, ...current]); closePanel() }} />}
    {canManage && editingJob && form && <section className="job-edit-panel">
      <div className="customer-form-heading"><h2>{t("编辑 ")}{editingJob.jobNumber}</h2><button className="text-button" type="button" disabled={isSaving} onClick={() => draft.leave(closePanel)}>{t("取消")}</button></div>
      <ValidatedForm className="customer-job-form" onSubmit={handleSave} aria-busy={isSaving}>
        <label><span>{t("工作单编号 *")}</span><input name="jobNumber" required maxLength={50} value={form.jobNumber} onChange={(event) => setForm({ ...form, jobNumber: event.target.value })} /></label>
        <label><span>{t("工作内容 *")}</span><input name="title" required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label><span>{t("服务日期 *")}</span><input name="serviceDate" required type="date" value={form.serviceDate} onClick={openDatePicker} onChange={(event) => setForm({ ...form, serviceDate: event.target.value })} /></label>
        <label><span>{t("团队 *")}</span><select name="team" required value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })}>
          <option value="未安排">{t("未安排")}</option>
          {form.team !== '未安排' && !teamsState.teams.some((team) => team.name === form.team) && <option value={form.team}>{form.team}{t("（旧资料）")}</option>}
          {teamsState.teams.filter((team) => team.isActive || team.name === form.team).map((team) => <option value={team.name} key={team.id}>{team.name}{t(team.isActive ? '' : '（已停用）')}</option>)}
        </select></label>
        <label><span>{t("状态 *")}</span><select name="status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as CustomerJob['status'] })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
        <div className="customer-job-form-actions"><button className="primary-button" type="submit" disabled={isSaving}>{t(isSaving ? '保存中…' : '保存修改')}</button></div>
      </ValidatedForm>
    </section>}
    {error && <p className="customer-error" role="alert">{t(error)}</p>}
    {canManage && <LoadState state={teamsState} label={t("团队资料")} />}
      <LoadState state={resource} label={t("工作单资料")} />
      <ListToolbar search={searchTerm} onSearch={setSearchTerm} searchLabel="搜索工作单" placeholder={t("搜索编号、客户或工作内容")} pagination={pagination} loading={isLoading} unavailable={!resource.available} sort={{ label: '排序', defaultLabel: '最接近施工日期（默认）', value: sortOption === 'closest' ? '' : sortOption, options: { newest: '建立日期：最新优先', earliest: '服务日期：最早优先', latest: '服务日期：最晚优先' }, onChange: value => setSortOption(value || 'closest') }} filters={[
        { label: '状态', value: statusFilter === 'all' ? '' : statusFilter, options: statusLabels, onChange: value => setStatusFilter(value || 'all') },
        { label: '团队', value: teamFilter, options: Object.fromEntries([...new Set(jobs.map(job => job.team))].sort().map(team => [team, team])), onChange: setTeamFilter },
        { label: '服务日期', value: dateFilter, options: dateOptions, onChange: setDateFilter },
      ]} />
    {viewedJob && <JobDetail key={viewedJob.id} job={viewedJob} returnState={position.linkState} canManage={canManage} busy={photosBusy} onBusy={setPhotosBusy} onClose={closePanel} />}
    {resource.available && (filteredJobs.length > 0 ? <>
      <div className="jobs-table-wrap"><table className="jobs-table"><thead><tr><th>{t("编号")}</th><th>{t("客户")}</th><th>{t("工作内容")}</th><th>{t("日期／团队")}</th><th>{t("状态")}</th><th><span className="visually-hidden">{t("操作")}</span></th></tr></thead><tbody>{pagination.items.map((job) => <tr key={job.id} data-list-row={job.id}>
        <td>{job.jobNumber}</td><td>{canManage ? <ListLink capture={position.capture} row={job.id} className="table-link" to={`/customers/${job.customerId}`}>{job.customerName ?? t('查看客户')}</ListLink> : (job.customerName ?? '—')}</td><td><span className="job-title-preview" title={job.title}>{job.title}</span></td><td>{formatDate(job.serviceDate)} · {job.team === '未安排' ? t('未安排') : job.team}</td><td><span className={`badge status-${statusLabels[job.status]}`}>{t(statusLabels[job.status])}</span></td><td className="customer-row-actions"><button className="primary-button job-view-button" type="button" disabled={photosBusy} onClick={() => draft.leave(() => { if (!photosBusy) panels.open('view', job.id) })}>{t("查看工作")}</button><button className="secondary-button" type="button" disabled={photosBusy} onClick={() => draft.leave(() => { panels.open('photos', job.id) })}>{t("照片")}</button>{canManage && <JobActions job={job} disabled={operation.busy || photosBusy || photoJobId === job.id} onEdit={() => startEdit(job)} onDelete={() => draft.leave(() => void handleDelete(job))} />}</td>
      </tr>)}</tbody></table></div>
      <div className="jobs-mobile-list">{pagination.items.map((job) => <article className="job-card" key={job.id} data-list-row={job.id}><div className="job-card-heading"><strong>{job.title}</strong><div className="job-card-heading-actions"><span className={`badge status-${statusLabels[job.status]}`}>{t(statusLabels[job.status])}</span>{canManage && <JobActions job={job} disabled={operation.busy || photosBusy || photoJobId === job.id} onEdit={() => startEdit(job)} onDelete={() => draft.leave(() => void handleDelete(job))} />}</div></div><span>{job.jobNumber} · {canManage ? <ListLink capture={position.capture} row={job.id} className="table-link" to={`/customers/${job.customerId}`}>{job.customerName ?? t('查看客户')}</ListLink> : (job.customerName ?? '—')}</span><small>{formatDate(job.serviceDate)} · {job.team === '未安排' ? t('未安排') : job.team}</small><div className="customer-card-actions"><button className="primary-button job-view-button" type="button" onClick={() => draft.leave(() => { panels.open('view', job.id) })}>{t("查看工作")}</button><button className="secondary-button" type="button" disabled={photosBusy} onClick={() => draft.leave(() => { panels.open('photos', job.id) })}>{t("照片")}</button></div></article>)}</div>
    </> : <DataState kind={(searchTerm || dateFilter || statusFilter !== 'all' || teamFilter) ? 'filtered' : 'empty'} title={t((searchTerm || dateFilter || statusFilter !== 'all' || teamFilter) ? '没有符合条件的结果' : '尚未有工作单资料')} description={t((searchTerm || dateFilter || statusFilter !== 'all' || teamFilter) ? '试试其他条件，或清除搜索与筛选。' : (canManage ? '可直接新增工作单，也可从客户详情新增或从已接受报价转换。' : '工作指派后会在这里显示，请联系管理员安排。'))} action={(searchTerm || dateFilter || statusFilter !== 'all' || teamFilter) ? <button type="button" className="secondary-button" onClick={clearFilters}>{t("清除搜索与筛选")}</button> : canManage ? <Link className="secondary-button" to="/customers">{t("前往客户新增工作")}</Link> : undefined} />)}
      {resource.available && <ListPagination pagination={pagination} />}
    {photoJob && <JobPhotos key={photoJob.id} job={photoJob} onClose={closePanel} onBusy={setPhotosBusy} />}
  </main>
}

function formatDate(date: string) { return date.replaceAll('-', '/') }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : '工作单请求失败，请稍后再试。' }

function JobActions({ job, disabled, onEdit, onDelete }: { job: CustomerJob; disabled: boolean; onEdit: () => void; onDelete: () => void }) {
  useLanguage()
  return <ActionMenu label={t(`更多操作：${job.jobNumber}`)} onEdit={onEdit} onDelete={onDelete} deleteDisabled={disabled} />
}
