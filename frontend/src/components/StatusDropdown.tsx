import { translate as t, useLanguage } from '../i18n'
import { PopupMenu } from './PopupMenu'
import './QuoteStatusDropdown.css'

export function StatusDropdown<T extends string>({ value, label, disabled, onChange, options, busy = false }: {
  value: T; label: string; disabled: boolean; onChange: (status: T) => void; options: Record<T, string>; busy?: boolean
}) {
  useLanguage()
  return <PopupMenu label={t(label)} disabled={disabled} className={`quote-status-trigger quote-status-${value}`}
    items={(Object.keys(options) as T[]).map(status => ({ label: options[status], selected: status === value,
      className: `quote-status-${status}`, icon: <i className="app-status-dot" />, onSelect: () => onChange(status) }))}>
    <span className="quote-status-chip"><i aria-hidden="true" />{t(busy ? '保存中…' : options[value])}</span>
  </PopupMenu>
}
