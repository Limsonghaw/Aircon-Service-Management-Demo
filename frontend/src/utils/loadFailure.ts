export type LoadFailure = { kind: 'session' | 'permission' | 'network' | 'server'; message: string }
export function loadFailure(error: unknown): LoadFailure {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401) return { kind: 'session', message: '登录已过期，请重新登录后继续。' }
  if (status === 403) return { kind: 'permission', message: '当前账号没有权限查看这些资料。请联系老板或管理员。' }
  if (error instanceof TypeError || (error instanceof Error && /连接中断|network|failed to fetch/i.test(error.message))) return { kind: 'network', message: '连接中断，请检查网络后重试。' }
  return { kind: 'server', message: '资料暂时无法加载，请稍后重试。' }
}
