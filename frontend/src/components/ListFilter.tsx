import { translate as t, useLanguage } from '../i18n'
import { useSearchParams } from 'react-router-dom'

export function ListFilter({ label, count, loading, error }: { label: string | null; count: number; loading: boolean; error?: boolean }) {
  useLanguage()
  const [params, setParams] = useSearchParams()
  if (!label) return null
  return <div className="list-filter" role="status">
    <button type="button" className="filter-chip" aria-label={t(`取消筛选：${label}`)} onClick={() => {
      const next = new URLSearchParams(params)
      next.delete('filter')
      next.delete('page')
      setParams(next)
    }}>{t(label)} <span aria-hidden="true">×</span></button>
    <span>{t(loading ? '正在载入…' : error ? '暂时无法载入数量' : `${count} 项符合条件`)}</span>
  </div>
}
