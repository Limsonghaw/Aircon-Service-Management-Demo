import { translate as t, useLanguage } from '../i18n'
import { MenuSelect } from './PopupMenu'
import './ListPagination.css'

type Pagination = { total: number; page: number; pageSize: number; pageCount: number; setPage: (page: number) => void; setPageSize: (size: number) => void }

export function ListPagination({ pagination }: { pagination: Pagination }) {
  useLanguage()
  const { page, pageSize, pageCount, setPage, setPageSize } = pagination
  return <nav className="list-pagination" aria-label={t("列表分页")}>
    <div className="list-page-size"><span>{t("每页")}</span><MenuSelect label={t("每页数量")} value={String(pageSize)} options={{ '10': '10 项', '20': '20 项', '50': '50 项' }} onChange={value => setPageSize(Number(value))} /></div>
    <div className="list-page-buttons">
      <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("上一页")}</button>
      {Array.from(new Set([1, ...Array.from({ length: 3 }, (_, index) => page + index - 1), pageCount])).filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b).map((value, index, pages) => <span className="list-page-slot" key={value}>
        {index > 0 && value - pages[index - 1] > 1 && <span aria-hidden="true">…</span>}
        <button type="button" aria-label={t(`第 ${value} 页`)} aria-current={value === page ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>
      </span>)}
      <button type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>{t("下一页")}</button>
    </div>
  </nav>
}

