export class ApiValidationError extends Error {
  readonly fields: Record<string, string[]>
  readonly status?: number
  constructor(message: string, fields: Record<string, string[]> = {}, status?: number) {
    super(safeApiMessage(message, status)); this.fields = status && status !== 400 && status !== 422 ? {} : Object.fromEntries(Object.entries(fields).map(([field, messages]) => [field, messages.map(message => safeApiMessage(message, status))])); this.status = status
  }
}

export function safeApiMessage(message: string, status?: number) {
  if (status === 401) return '登录已过期，请重新登录后继续。'
  if (status === 403) return '当前账号没有权限查看或操作这些资料。'
  if ((status && status >= 500) || /stack trace|exception|postgres|sqlstate|service.?role|api.?key|\bat .+\(.+\)|\bselect\b.+\bfrom\b/i.test(message)) return '服务器暂时无法处理请求，请稍后重试。'
  return message
}
