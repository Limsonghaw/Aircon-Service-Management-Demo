import { translate as t, useLanguage } from '../i18n'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { useInteraction } from '../contexts/InteractionContext'
import { getListOrigin, restoreListOrigin } from '../hooks/useListPosition'
function historyIndex() { return Number(window.history.state?.idx ?? 0) }

export function BackToList({ path, children, className = 'back-link' }: { path: string; children: React.ReactNode; className?: string }) {
  useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { leave } = useInteraction()
  const candidate = (location.state as { listOrigin?: unknown } | null)?.listOrigin
  const origin = getListOrigin(candidate, user?.id ?? '')
  const target = origin?.url ?? path
  return <Link className={className} to={target} state={origin ? { restoreList: origin.key } : { defaultList: true }} onClick={event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    leave(() => { if (origin) restoreListOrigin(origin); if (origin && historyIndex() === origin.index + 1) navigate(-1); else navigate(target, { state: origin ? { restoreList: origin.key } : { defaultList: true } }) })
  }}>{t(origin && origin.path !== path ? '← 返回原列表' : children)}</Link>
}
