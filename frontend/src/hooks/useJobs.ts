import { useEffect } from 'react'
import { getJobs, type CustomerJob } from '../services/customersApi'
import { subscribeJobChanges } from '../services/jobChanges'
import { useResource } from './useResource'

export function useJobs(live = false) {
  const state = useResource(getJobs, [] as CustomerJob[])
  const { retry } = state
  useEffect(() => subscribeJobChanges(retry), [retry])
  useEffect(() => {
    if (!live) return
    const refreshVisible = () => { if (document.visibilityState === 'visible') retry() }
    window.addEventListener('focus', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const interval = window.setInterval(refreshVisible, 30_000)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible) }
  }, [live, retry])
  return { ...state, jobs: state.data }
}
