import { translate as t, useLanguage } from '../i18n'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useJobs } from '../hooks/useJobs'
import { useTeams } from '../hooks/useTeams'
import { createEmployee, createTeam, updateEmployee, updateTeam, type Employee, type EmployeeInput, type Team, type TeamInput } from '../services/teamsApi'

const emptyTeam: TeamInput = { name: '', notes: '', isActive: true }

export function TeamPage() {
  useLanguage()
  const jobsState = useJobs()
  const teamsState = useTeams()
  const [teamForm, setTeamForm] = useState<{ id: string | null; input: TeamInput } | null>(null)
  const [employeeForm, setEmployeeForm] = useState<{ id: string | null; input: EmployeeInput } | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  function editTeam(team: Team) {
    setTeamForm({ id: team.id, input: { name: team.name, notes: team.notes ?? '', isActive: team.isActive } })
    setEmployeeForm(null); setError('')
  }

  function addEmployee(teamId: string) {
    setEmployeeForm({ id: null, input: { teamId, name: '', phone: '', role: '技术员', notes: '', isActive: true } })
    setTeamForm(null); setError('')
  }

  function editEmployee(employee: Employee) {
    setEmployeeForm({ id: employee.id, input: { teamId: employee.teamId, name: employee.name,
      phone: employee.phone ?? '', role: employee.role, notes: employee.notes ?? '', isActive: employee.isActive } })
    setTeamForm(null); setError('')
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault()
    if (!teamForm) return
    setIsSaving(true); setError('')
    try {
      const input = { ...teamForm.input, name: teamForm.input.name.trim(), notes: teamForm.input.notes?.trim() || null }
      if (teamForm.id) await updateTeam(teamForm.id, input)
      else await createTeam(input)
      await teamsState.reload(); setTeamForm(null)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setIsSaving(false) }
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault()
    if (!employeeForm?.input.teamId) { setError('请选择团队。'); return }
    setIsSaving(true); setError('')
    try {
      const input = { ...employeeForm.input, name: employeeForm.input.name.trim(), role: employeeForm.input.role.trim(),
        phone: employeeForm.input.phone?.trim() || null, notes: employeeForm.input.notes?.trim() || null }
      if (employeeForm.id) await updateEmployee(employeeForm.id, input)
      else await createEmployee(input.teamId!, input)
      await teamsState.reload(); setEmployeeForm(null)
    } catch (failure) { setError(errorMessage(failure)) }
    finally { setIsSaving(false) }
  }

  const unassignedJobs = jobsState.jobs.filter((job) => job.team === '未安排')
  return <main>
    <div className="page-heading"><div><h1>{t("员工与团队")}</h1><p>{t("管理团队、员工资料与工作安排。")}</p></div>
      <button className="primary-button" type="button" onClick={() => { setTeamForm({ id: null, input: emptyTeam }); setEmployeeForm(null); setError('') }}>{t("新增团队")}</button></div>

    {(error || teamsState.error || jobsState.error) && <p className="customer-error" role="alert">{t(error || teamsState.error || jobsState.error)}</p>}
    {teamForm && <section className="invoice-form-panel"><div className="customer-form-heading"><h2>{t(teamForm.id ? '编辑团队' : '新增团队')}</h2>
      <button className="text-button" type="button" onClick={() => setTeamForm(null)}>{t("取消")}</button></div>
      <form className="invoice-form" onSubmit={saveTeam}>
        <label>{t("团队名称")}<input required maxLength={100} value={teamForm.input.name} onChange={(event) => setTeamForm({ ...teamForm, input: { ...teamForm.input, name: event.target.value } })} /></label>
        <label className="form-checkbox"><input type="checkbox" checked={teamForm.input.isActive} onChange={(event) => setTeamForm({ ...teamForm, input: { ...teamForm.input, isActive: event.target.checked } })} />{t("启用团队")}</label>
        <label className="invoice-form-wide">{t("备注")}<textarea maxLength={2000} rows={3} value={teamForm.input.notes ?? ''} onChange={(event) => setTeamForm({ ...teamForm, input: { ...teamForm.input, notes: event.target.value } })} /></label>
        <div className="customer-form-actions invoice-form-wide"><button className="primary-button" disabled={isSaving}>{t(isSaving ? '保存中…' : '保存团队')}</button></div>
      </form></section>}

    {employeeForm && <section className="invoice-form-panel"><div className="customer-form-heading"><h2>{t(employeeForm.id ? '编辑员工' : '新增员工')}</h2>
      <button className="text-button" type="button" onClick={() => setEmployeeForm(null)}>{t("取消")}</button></div>
      <form className="invoice-form" onSubmit={saveEmployee}>
        <label>{t("姓名")}<input required maxLength={200} value={employeeForm.input.name} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, name: event.target.value } })} /></label>
        <label>{t("团队")}<select required value={employeeForm.input.teamId ?? ''} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, teamId: event.target.value } })}>
          {teamsState.teams.map((team) => <option key={team.id} value={team.id}>{team.name}{t(team.isActive ? '' : '（已停用）')}</option>)}</select></label>
        <label>{t("职务")}<input required maxLength={100} value={employeeForm.input.role} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, role: event.target.value } })} /></label>
        <label>{t("电话")}<input maxLength={50} value={employeeForm.input.phone ?? ''} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, phone: event.target.value } })} /></label>
        <label className="form-checkbox"><input type="checkbox" checked={employeeForm.input.isActive} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, isActive: event.target.checked } })} />{t("在职")}</label>
        <label className="invoice-form-wide">{t("备注")}<textarea maxLength={2000} rows={3} value={employeeForm.input.notes ?? ''} onChange={(event) => setEmployeeForm({ ...employeeForm, input: { ...employeeForm.input, notes: event.target.value } })} /></label>
        <div className="customer-form-actions invoice-form-wide"><button className="primary-button" disabled={isSaving}>{t(isSaving ? '保存中…' : '保存员工')}</button></div>
      </form></section>}

    {teamsState.isLoading || jobsState.isLoading ? <p className="empty-state">{t("正在载入团队资料…")}</p> : <>
      {teamsState.teams.length ? <section className="team-grid" aria-label={t("团队工作概览")}>{teamsState.teams.map((team) => {
        const teamJobs = jobsState.jobs.filter((job) => job.team === team.name)
        return <article className="team-card" key={team.id}>
          <div className="team-card-heading"><div><h2>{team.name}</h2><span className={`badge ${team.isActive ? 'status-已确认' : 'status-已完成'}`}>{t(team.isActive ? '启用' : '已停用')}</span></div>
            <div className="team-actions"><button type="button" onClick={() => editTeam(team)}>{t("编辑团队")}</button><button type="button" onClick={() => addEmployee(team.id)}>{t("新增员工")}</button></div></div>
          {team.notes && <p className="team-notes">{team.notes}</p>}
          <div className="employee-list">{team.employees.length ? team.employees.map((employee) => <button type="button" className="employee-row" key={employee.id} onClick={() => editEmployee(employee)}>
            <span><strong>{employee.name}</strong><small>{employee.role}{employee.phone ? ` · ${employee.phone}` : ''}</small></span>
            <span className={`badge ${employee.isActive ? 'status-已确认' : 'status-已完成'}`}>{t(employee.isActive ? '在职' : '已离职')}</span>
          </button>) : <p className="empty-agenda">{t("这个团队还没有员工。")}</p>}</div>
          <h3>{teamJobs.length}{t(" 项工作")}</h3>
          <div className="team-job-list">{teamJobs.length ? teamJobs.map((job) => <Link className="team-job team-job-link" to={`/customers/${job.customerId}`} key={job.id}>
            <strong>{job.jobNumber} · {job.title}</strong><small>{job.customerName ?? t('查看客户')} · {job.serviceDate}</small>
          </Link>) : <p className="empty-agenda">{t("目前没有工作安排。")}</p>}</div>
        </article>
      })}</section> : <p className="empty-state">{t("尚未建立团队。")}</p>}
      <section className="unassigned-jobs"><div className="team-card-heading"><h2>{t("未安排团队")}</h2><span>{unassignedJobs.length}{t(" 项工作")}</span></div>
        {unassignedJobs.length ? <div className="team-job-list">{unassignedJobs.map((job) => <Link className="team-job team-job-link" to={`/customers/${job.customerId}`} key={job.id}>
          <strong>{job.jobNumber} · {job.title}</strong><small>{job.customerName ?? t('查看客户')} · {job.serviceDate}</small></Link>)}</div> : <p className="empty-agenda">{t("目前没有等待安排团队的工作。")}</p>}
      </section>
    </>}
  </main>
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '保存团队资料失败。'
}
