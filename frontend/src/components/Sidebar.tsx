import { translate as t, useLanguage } from '../i18n'
import { NavLink, useLocation } from 'react-router-dom'
import type { UserRole } from '../services/authApi'

const directItems = [
  { label: '总览首页', path: '/' },
  { label: '工作单', path: '/jobs' },
  { label: '客户', path: '/customers' },
  { label: '报价', path: '/quotes' },
  { label: '发票', path: '/invoices' },
  { label: '工作日历', path: '/calendar' },
  { label: '待处理', path: '/pending' },
]
const navigationGroups = [
  { label: '财务与支出', items: [{ label: '费用', path: '/expenses' }, { label: '财务报表', path: '/reports' }] },
  { label: '人员与记录', items: [{ label: '员工与团队', path: '/team' }, { label: '用户与权限', path: '/users' }, { label: '操作日志', path: '/activity' }] },
]
function NavigationIcon({ path }: { path: string }) {
  useLanguage()
  const shapes: Record<string, string> = {
    '/': 'M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7',
    '/jobs': 'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6',
    '/customers': 'M16 21v-3a4 4 0 0 0-8 0v3M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
    '/quotes': 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
    '/invoices': 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6',
    '/calendar': 'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18M7 14h2M13 14h2',
    '/pending': 'M5 18h14l-2-3V9a5 5 0 0 0-10 0v6zM10 21h4',
  }
  return <svg className="sidebar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={shapes[path] || 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5'} /></svg>
}

export function Sidebar({ role }: { role: UserRole }) {
  useLanguage()
  const { pathname } = useLocation()
  const items = role === 'employee' ? directItems.filter(item => ['/jobs', '/calendar'].includes(item.path)) : directItems
  return <aside className="sidebar" id="main-sidebar">
    <div className="brand"><strong>Aircon Service Management (Demo)</strong><small>{t("业务管理系统")}</small></div>
    <nav aria-label={t("主要导航")}>
      <div className="sidebar-direct-links">{role !== 'employee' && <span className="sidebar-section-label">{t("业务工作台")}</span>}{items.map(item => <NavLink key={item.path} to={item.path} end={item.path === '/'}><NavigationIcon path={item.path} /><span>{t(item.label)}</span></NavLink>)}</div>
      {role !== 'employee' && <span className="sidebar-section-label">{t("管理")}</span>}
      {role !== 'employee' && navigationGroups.map(group => <details key={`${group.label}-${pathname}`} open={group.items.some(item => pathname === item.path || pathname.startsWith(`${item.path}/`))}>
        <summary>{t(group.label)}</summary>
        <div className="nav-group-items">{group.items.map(item => <NavLink to={item.path} key={item.path}>{t(item.label)}</NavLink>)}</div>
      </details>)}
    </nav>
  </aside>
}
