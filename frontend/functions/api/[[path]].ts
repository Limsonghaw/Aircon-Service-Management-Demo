import { proxyApiRequest } from './proxy.ts'

export function onRequest({ request, env }: {
  request: Request
  env: { API_ORIGIN?: string }
}): Promise<Response> {
  return proxyApiRequest(request, env.API_ORIGIN)
}
