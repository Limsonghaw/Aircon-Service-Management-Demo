import { translate as t, useLanguage } from '../i18n'
import { PopupMenu } from './PopupMenu'

export function ActionMenu({ label, onEdit, onPrint, onReturnedDocuments, onDelete, deleteDisabled = false, align = 'start' }: {
  label: string; onEdit: () => void; onPrint?: () => void; onReturnedDocuments?: () => void; onDelete?: () => void; deleteDisabled?: boolean; align?: 'start' | 'end'
}) {
  useLanguage()
  return <PopupMenu label={t(label)} align={align} className="app-action-trigger" items={[
    { label: '编辑', onSelect: onEdit, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5" /></svg> },
    ...(onPrint ? [{ label: '打印 / PDF', onSelect: onPrint, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 8V3h10v5M7 17H4V8h16v9h-3M7 14h10v7H7zM16 11h1" /></svg> }] : []),
    ...(onReturnedDocuments ? [{ label: '客户签回 PDF', onSelect: onReturnedDocuments }] : []),
    ...(onDelete ? [{ label: '删除', onSelect: onDelete, disabled: deleteDisabled, danger: true, icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg> }] : []),
  ]}>⋯</PopupMenu>
}
