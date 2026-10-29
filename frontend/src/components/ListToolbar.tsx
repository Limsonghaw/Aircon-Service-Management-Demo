import { translate as t, useLanguage } from '../i18n'
import { MenuSelect } from './PopupMenu'
import { useId, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClearListFilters } from '../hooks/useListPagination'
import './ListPagination.css'

type Filter = { defaultLabel?: string; label: string; value: string; options: Record<string, string>; onChange: (value: string) => void }

export function ListToolbar({ search, onSearch, searchLabel, placeholder, filters, pagination, loading, entryLabel, sort, unavailable = false }: {
  search: string; onSearch: (value: string) => void; searchLabel: string; placeholder: string
  filters: Filter[]; sort?: Filter; pagination: { total: number; page: number; pageCount: number }; loading: boolean; entryLabel?: string | null; unavailable?: boolean
}) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [, setParams] = useSearchParams()
  const id = useId()
  const searchInput = useRef<HTMLInputElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  function closeFilters() { setOpen(false); filterTrigger.current?.focus({ preventScroll: true }) }
  const clearFilters = useClearListFilters()
  const active = filters.filter(filter => filter.value)
  const activeCount = active.length + (entryLabel ? 1 : 0)
  const fields = sort ? [...filters, sort] : filters
  return <div className="unified-list-toolbar">
    <div className="list-controls-row">
      <label className="list-search"><span className="visually-hidden">{t(searchLabel)}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input aria-describedby={id + '-search-hint'} ref={searchInput} type="search" placeholder={placeholder} value={search} onChange={event => onSearch(event.target.value)} />{search && <button className="list-search-clear" type="button" aria-label={t("清除搜索文字")} onClick={() => { onSearch(''); searchInput.current?.focus() }}>×</button>}</label>
      <button ref={filterTrigger} className="list-mobile-filter" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z" /></svg>{t("筛选／排序")}{activeCount > 0 && <span>{activeCount}</span>}</button>
      <div id={id} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); closeFilters() } }} className={`list-filter-fields${open ? ' is-open' : ''}`}>
        {fields.map(filter => <div className={'list-filter-field' + (filter === sort ? ' list-sort-field' : '')} key={filter.label}><span>{t(filter.label)}</span><MenuSelect label={t(filter.label)} value={filter.value} options={{ '': filter.defaultLabel ?? (filter.label.includes('状态') ? '全部状态' : '全部'), ...filter.options }} onChange={filter.onChange} /></div>)}
        <button type="button" className="list-filter-done" onClick={closeFilters}>{t("完成筛选")}</button>
      </div>
    </div>
    <p id={id + '-search-hint'} className="list-search-hint">{t(placeholder.replace(/^搜索/, '可搜索：'))}</p>
    <div className="list-summary-row">
      <div className="list-active-filters">
        {entryLabel && <button className="filter-chip" type="button" aria-label={t(`取消筛选：${t(entryLabel)}`)} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.delete('filter'); next.delete('page'); return next })}>{t(entryLabel)}<span aria-hidden="true">×</span></button>}
        {active.map(filter => <button key={filter.label} className="filter-chip" type="button" aria-label={t(`取消筛选：${filter.label}`)} onClick={() => filter.onChange('')}>{t(filter.label)}：{t(filter.options[filter.value] ?? filter.value)}<span aria-hidden="true">×</span></button>)}
        {search && <button className="filter-chip" type="button" aria-label={t("清除搜索")} onClick={() => onSearch('')}>{t("搜索：")}{search}<span aria-hidden="true">×</span></button>}
      {(search || activeCount > 0) && <button type="button" className="list-clear-all" onClick={clearFilters}>{t("清除搜索与筛选")}</button>}
      </div>
      <span className="list-result-count" role="status">{t(loading ? '正在载入…' : unavailable ? '数量尚未加载' : `共 ${pagination.total} 项 · 第 ${pagination.page} / ${pagination.pageCount} 页`)}</span>
    </div>
  </div>
}
