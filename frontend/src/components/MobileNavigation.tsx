import { translate as t, useLanguage } from '../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useFinancialData } from '../hooks/useFinancialData'
import { buildPendingItems } from '../utils/buildPendingItems'
import type { UserRole } from '../services/authApi'

type MobileIconName = 'home' | 'jobs' | 'calendar' | 'notifications'

const mobileNavigationItems = [
  { label: '首页', icon: 'home' as MobileIconName, path: '/' },
  { label: '工作单', icon: 'jobs' as MobileIconName, path: '/jobs' },
  { label: '日历', icon: 'calendar' as MobileIconName, path: '/calendar' },
  { label: '待处理', icon: 'notifications' as MobileIconName, path: '/pending' },
]

const mobileMoreItems = [
  { label: '客户', path: '/customers' },
  { label: '报价', path: '/quotes' },
  { label: '发票', path: '/invoices' },
  { label: '费用', path: '/expenses' },
  { label: '财务报表', path: '/reports' },
  { label: '员工与团队', path: '/team' },
  { label: '用户与权限', path: '/users' },
  { label: '操作日志', path: '/activity' },
]

function MobileNavIcon({ name }: { name: MobileIconName }) {
  useLanguage()
  if (name === 'jobs') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" /></svg>
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.5 12 3l8.5 7.5" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
      </svg>
    )
  }

  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  )
}

function MoreIcon() {
  useLanguage()
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </svg>
  )
}

export function MobileNavigation({ role }: { role: UserRole }) {
  useLanguage()
  const location = useLocation()
  const financial = useFinancialData(role !== 'employee')
  const hasPendingItems = buildPendingItems(financial.quotes, financial.invoices, financial.expenses).length > 0
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isMoreMounted, setIsMoreMounted] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)
  const isMoreRoute = mobileMoreItems.some(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`),
  )
  const visibleMainItems = role === 'employee'
    ? mobileNavigationItems.filter((item) => item.path === '/jobs' || item.path === '/calendar')
    : mobileNavigationItems

  const openMoreMenu = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setIsMoreMounted(true)
    window.requestAnimationFrame(() => setIsMoreOpen(true))
  }, [])

  const closeMoreMenu = useCallback(() => {
    setIsMoreOpen(false)
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setIsMoreMounted(false), 180)
  }, [])

  useEffect(() => {
    if (!isMoreOpen) return

    closeButtonRef.current?.focus()

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMoreMenu()
    }

    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [closeMoreMenu, isMoreOpen])

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
  }, [])

  return (
    <>
      {isMoreMounted && (
        <>
          <button
            className={`mobile-menu-backdrop${isMoreOpen ? ' is-open' : ''}`}
            type="button"
            aria-label={t("关闭更多菜单")}
            onClick={closeMoreMenu}
          />

          <section
            className={`mobile-more-menu${isMoreOpen ? ' is-open' : ''}`}
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
          >
            <div className="mobile-more-heading">
              <h2 id="mobile-more-title">{t("更多功能")}</h2>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t("关闭更多菜单")}
                onClick={closeMoreMenu}
              >
                ×
              </button>
            </div>

            <nav className="mobile-more-links" aria-label={t("手机更多导航")}>
              {mobileMoreItems.map((item) => (
                <NavLink to={item.path} key={item.path} onClick={closeMoreMenu}>
                  {t(item.label)}
                </NavLink>
              ))}
            </nav>
          </section>
        </>
      )}

      <nav className={`mobilebar${role === 'employee' ? ' employee-mobilebar' : ''}${isMoreOpen ? ' more-open' : ''}`} aria-label={t("手机主要导航")}>
        {visibleMainItems.map((item) => (
          <NavLink
            to={item.path}
            end={item.path === '/'}
            key={item.label}
            aria-label={t(item.label)}
            onClick={closeMoreMenu}
          >
            <span className="mobile-nav-icon">
              <MobileNavIcon name={item.icon} />
              {item.path === '/pending' && hasPendingItems && (
                <span className="mobile-nav-dot" aria-hidden="true" />
              )}
            </span>
            <span className="mobile-nav-label">{t(item.label)}</span>
          </NavLink>
        ))}

        {role !== 'employee' && <button
          className={isMoreOpen || isMoreRoute ? 'active' : undefined}
          type="button"
          aria-label={t("更多")}
          aria-expanded={isMoreOpen}
          aria-controls="mobile-more-menu"
          onClick={isMoreOpen ? closeMoreMenu : openMoreMenu}
        >
          <span className="mobile-nav-icon"><MoreIcon /></span>
          <span className="mobile-nav-label">{t("更多")}</span>
        </button>}
      </nav>
    </>
  )
}
