import { translate as t, useLanguage } from '../i18n'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { changeUserRole, getUsers, type AuthUser, type UserRole } from '../services/authApi'
import { bindEmployeeAccount, getEmployeeAccountLinks, type EmployeeAccountLink } from '../services/jobAccessApi'
import { useTeams } from '../hooks/useTeams'

const roleLabels: Record<UserRole, string> = { owner: '老板', admin: '管理员', employee: '员工' }

export function UsersPage() {
  useLanguage()
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [error, setError] = useState('')
  const [links, setLinks] = useState<EmployeeAccountLink[]>([])
  const teamsState = useTeams()
  const employees = teamsState.teams.flatMap((team) => team.employees.map((employee) => ({ ...employee, teamName: team.name })))

  useEffect(() => {
    let cancelled = false
    void Promise.all([getUsers(), getEmployeeAccountLinks()])
      .then(([result, bindings]) => { if (!cancelled) { setUsers(result); setLinks(bindings) } })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : '无法载入用户。') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function updateRole(id: string, role: UserRole) {
    setSavingId(id)
    setError('')
    try {
      const updated = await changeUserRole(id, role)
      setUsers((current) => current.map((user) => user.id === id ? updated : user))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法更新用户权限。')
    } finally {
      setSavingId('')
    }
  }

  async function updateBinding(id: string, employeeId: string | null) {
    setSavingId(id)
    setError('')
    try {
      await bindEmployeeAccount(id, employeeId)
      setLinks((current) => current.map((link) => link.id === id ? { ...link, employeeId } : link))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '无法更新绑定。')
    } finally { setSavingId('') }
  }

  return <main>
    <div className="page-heading"><div><h1>{t("用户与权限")}</h1><p>{t("管理系统账号的角色与访问范围。")}</p></div></div>
    {error && <p className="customer-error" role="alert">{t(error)}</p>}
    {teamsState.error && <p className="customer-error" role="alert">{t(teamsState.error)}</p>}
    {loading ? <section className="activity-empty"><p>{t("正在载入用户…")}</p></section>
      : <section className="users-panel">
        <div className="users-table-wrap"><table className="users-table">
          <thead><tr><th>{t("用户")}</th><th>{t("电邮")}</th><th>{t("角色")}</th><th>{t("绑定员工")}</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td><strong>{user.displayName}</strong>{user.id === currentUser?.id && <small>{t("目前账号")}</small>}</td>
            <td>{user.email}</td>
            <td>{currentUser?.role === 'owner' ? <select aria-label={t(`${user.displayName}的角色`)}
              value={user.role} disabled={savingId === user.id}
              onChange={(event) => void updateRole(user.id, event.target.value as UserRole)}>
              {Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{t(label)}</option>)}
            </select> : roleLabels[user.role]}</td>
            <td><select aria-label={t(`${user.displayName}绑定员工`)}
              value={links.find((link) => link.id === user.id)?.employeeId ?? ''}
              disabled={savingId !== '' || teamsState.isLoading || !!teamsState.error}
              onChange={(event) => void updateBinding(user.id, event.target.value || null)}>
              <option value="">{t("未绑定")}</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}
                disabled={links.some((link) => link.id !== user.id && link.employeeId === employee.id)}>
                {employee.name} · {employee.teamName}{t(employee.isActive ? '' : '（已停用）')}
              </option>)}
            </select></td>
          </tr>)}</tbody>
        </table></div>
        <p className="users-note">{t("账号需先在 Supabase Authentication 建立。系统必须保留至少一个老板账号。")}</p>
        <p className="users-note">{t("员工账号绑定后，可查看其有效团队的工作单和日历；未绑定或已停用的员工没有可见工作。")}</p>
      </section>}
  </main>
}
