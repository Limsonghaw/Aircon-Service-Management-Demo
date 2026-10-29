export const jobsChangedEvent = 'jobs-changed'
const channelName = 'shengheng-jobs'
function openChannel() {
  try { return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channelName) : null }
  catch { return null } // Focus/poll refresh still works if the browser restricts channels.
}

// Only invalidate data. Each account re-reads its own permitted jobs from the API.
export function notifyJobsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(jobsChangedEvent))
  const channel = openChannel()
  try { channel?.postMessage('changed') }
  catch { /* A refresh notification must never turn a saved job into a failed save. */ }
  finally { channel?.close() }
}

export function subscribeJobChanges(callback: () => void) {
  window.addEventListener(jobsChangedEvent, callback)
  const channel = openChannel()
  if (channel) channel.onmessage = callback
  return () => { window.removeEventListener(jobsChangedEvent, callback); channel?.close() }
}
