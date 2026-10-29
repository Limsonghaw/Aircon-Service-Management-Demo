import { translate as t, useLanguage } from '../i18n'
import type { AuthUser } from '../services/authApi'
import { LanguageSwitch } from './LanguageSwitch'

type TopbarProps = {
  currentPage: string
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  user: AuthUser
  onLogout: () => void
}

const roleLabels = { owner: '老板', admin: '管理员', employee: '员工' }

export function Topbar({ currentPage, isSidebarCollapsed, onToggleSidebar, user, onLogout }: TopbarProps) {
  useLanguage()
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="sidebar-toggle"
          type="button"
          aria-controls="main-sidebar"
          aria-expanded={!isSidebarCollapsed}
          aria-label={t(isSidebarCollapsed ? '展开导航' : '收起导航')}
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        <span className="desktop-crumb">{t("首页 / ")}{t(currentPage)}</span>
      </div>

      <strong className="mobile-title">Aircon Service Management (Demo)</strong>
      <div className="topbar-user">
        <LanguageSwitch />
        <span><strong>{user.displayName}</strong><small>{t(roleLabels[user.role])}</small></span>
        <button className="text-button" type="button" onClick={onLogout}>{t("登出")}</button>
      </div>
    </header>
  )
}
