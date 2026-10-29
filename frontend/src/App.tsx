import { translate as t, useLanguage } from './i18n'
import { useLayoutEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { DataState, LoadState } from './components/DataState'
import { MobileNavigation } from './components/MobileNavigation'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { ActivityLogPage } from './pages/ActivityLogPage'
import { CalendarPage } from './pages/CalendarPage'
import { CustomersPage } from './pages/CustomersPage'
import { CustomerDetailPage } from './pages/CustomerDetailPage'
import { DashboardPage } from './pages/DashboardPage'
import { ExpensesPage } from './pages/ExpensesPage'
import { FinancialReportsPage } from './pages/FinancialReportsPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { JobsPage } from './pages/JobsPage'
import { PendingPage } from './pages/PendingPage'
import { QuoteDetailPage } from './pages/QuoteDetailPage'
import { QuotesPage } from './pages/QuotesPage'
import { TeamPage } from './pages/TeamPage'
import { LoginPage } from './pages/LoginPage'
import { UsersPage } from './pages/UsersPage'
import { useAuth } from './contexts/useAuth'
import { useInteraction } from './contexts/InteractionContext'

function App() {
  useLanguage()
  const { user, loading, logout, session } = useAuth()
  const { leave } = useInteraction()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const location = useLocation()
  useLayoutEffect(() => {
    if (!/^\/(customers|jobs|quotes|invoices|expenses)(\/|$)/.test(location.pathname)) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [location.pathname])

  useLayoutEffect(() => {
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    return () => { history.scrollRestoration = previous }
  }, [])

  const pageTitles: Record<string, string> = {
    '/': '总览',
    '/activity': '操作日志',
    '/calendar': '工作日历',
    '/customers': '客户',
    '/expenses': '费用',
    '/reports': '财务报表',
    '/team': '员工与团队',
    '/users': '用户与权限',
    '/invoices': '发票',
    '/jobs': '工作单',
    '/pending': '待处理',
    '/quotes': '报价',
  }
  const currentPage = location.pathname.startsWith('/quotes/')
    ? '报价详情'
    : location.pathname.startsWith('/customers/')
      ? '客户详情'
    : (pageTitles[location.pathname] ?? '总览')

  if (loading) return <main className="auth-loading" aria-live="polite">{t("正在确认登录状态…")}</main>
  if (!user && session.failure) return <main className="auth-loading"><LoadState state={session} label={t("登录状态")} /></main>
  if (!user) return <LoginPage />

  const isManagement = user.role === 'owner' || user.role === 'admin'

  return (
    <div className={`app-layout${isSidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar role={user.role} />

      <div className="content">
        <Topbar
          currentPage={currentPage}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
          user={user}
          onLogout={() => leave(() => void logout())}
        />
        <Routes>
          <Route path="/" element={isManagement ? <DashboardPage /> : <Navigate to="/jobs" replace />} />
          <Route path="/calendar" element={<CalendarPage canViewCustomers={isManagement} />} />
          <Route path="/jobs" element={<JobsPage canManage={isManagement} />} />
          {isManagement && <>
            <Route path="/activity" element={<ActivityLogPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:customerId" element={<CustomerDetailPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/reports" element={<FinancialReportsPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/pending" element={<PendingPage />} />
            <Route path="/quotes" element={<QuotesPage />} />
            <Route path="/quotes/:quoteId" element={<QuoteDetailPage />} />
          </>}
          <Route path="*" element={!isManagement && /^(\/customers|\/quotes|\/invoices|\/expenses|\/reports|\/users|\/team|\/activity|\/pending)(\/|$)/.test(location.pathname) ? <main><DataState kind="permission" title={t("当前账号无权访问此页面")} description={t("请联系老板或管理员，或返回你的工作单。")} /></main> : <Navigate to={isManagement ? '/' : '/jobs'} replace />} />
        </Routes>
      </div>

      <MobileNavigation role={user.role} />
    </div>
  )
}

export default App
