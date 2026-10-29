import { translate as t, useLanguage } from '../i18n'
import type { ReactNode } from 'react'
import type { LoadFailure } from '../utils/loadFailure'
import { useInteraction } from '../contexts/InteractionContext'
import { useAuth } from '../contexts/useAuth'
import './DataState.css'

export function DataState({ title, description, action, kind = 'empty' }: { title: string; description?: string; action?: ReactNode; kind?: 'empty' | 'filtered' | 'permission' | 'error' }) {
  useLanguage()
  return <section className={`data-state data-state-${kind}`} role={kind === 'permission' || kind === 'error' ? 'alert' : 'status'}>
    <span className="data-state-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">{kind === 'error' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v1" /></> : kind === 'filtered' ? <><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></> : kind === 'permission' ? <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></> : <><path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5" /></>}</svg></span>
    <div><h3>{t(title)}</h3>{description && <p>{t(description)}</p>}{action && <div className="data-state-actions">{action}</div>}</div>
  </section>
}

export function LoadState({ state, label }: { state: { isLoading: boolean; loaded: boolean; failure: LoadFailure | null; retry: () => void }; label: string }) {
  useLanguage()
  const { leave } = useInteraction()
  const { reauthenticate } = useAuth()
  if (state.isLoading && !state.loaded) return <div className="data-state data-state-loading" role="status" aria-live="polite"><span className="state-spinner" aria-hidden="true" />{t("正在加载")}{t(label)}…</div>
  if (state.failure) return <section className="data-state data-state-error" role="alert">
    <span className="data-state-icon" aria-hidden="true">!</span><div><h3>{t(state.isLoading ? '正在重试…' : state.failure.kind === 'session' ? '登录已过期' : state.failure.kind === 'permission' ? '访问受限' : state.loaded ? '更新失败，当前显示上次加载的资料' : `${t(label)}加载失败`)}</h3>
      <p>{t(state.failure.message)}</p><div className="data-state-actions">{state.failure.kind === 'session' ? <button type="button" className="primary-button" onClick={() => leave(reauthenticate)}>{t("重新登录")}</button> : <button type="button" className="secondary-button" disabled={state.isLoading} onClick={state.retry}>{t(state.isLoading ? '重试中…' : '重试')}</button>}</div></div>
  </section>
  if (state.isLoading) return <div className="data-state data-state-loading" role="status"><span className="state-spinner" aria-hidden="true" />{t("正在更新")}{t(label)}{t("，当前显示上次加载的资料…")}</div>
  return null
}
