import { translate as t, useLanguage } from '../i18n'
import { Link } from 'react-router-dom'
import { useFinancialData } from '../hooks/useFinancialData'
import { buildPendingItems } from '../utils/buildPendingItems'

export function PendingPage() {
  useLanguage()
  const financial = useFinancialData()
  const pendingItems = buildPendingItems(financial.quotes, financial.invoices, financial.expenses)

  return <main>
    <div className="page-heading"><div><h1>{t("待处理")}</h1><p>{t("需要老板跟进的真实业务事项。")}</p></div></div>
    {financial.error && <p className="customer-error" role="alert">{t(financial.error)}<button type="button" onClick={financial.retry}>{t("重试")}</button></p>}
    <section className="pending-card" aria-labelledby="pending-list-title">
      <h2 id="pending-list-title">{t("待办列表")}</h2>
      {financial.isLoading ? <p className="empty-agenda">{t("正在加载待办事项…")}</p> : !financial.error && pendingItems.length ? (
        <div className="dashboard-list">{pendingItems.map((item) => (
          <Link className="dashboard-row dashboard-row-link" to={item.path} key={item.id}>
            <div><strong>{t(item.title)}</strong><small>{item.detail}</small></div>
            <span className="badge alert">{t("待处理")}</span>
          </Link>
        ))}</div>
      ) : !financial.error ? <p className="empty-agenda">{t("目前没有待处理事项。")}</p> : null}
    </section>
  </main>
}
