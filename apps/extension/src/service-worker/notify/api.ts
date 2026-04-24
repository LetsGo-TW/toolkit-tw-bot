import { AuthRequestError } from '../world-players/license/issue'
import { ensureNotifyToken, refreshNotifyToken } from './auth'

const API_ORIGIN = process.env.EXTENSION_API_ORIGIN

type RequestNotifyApiJsonOptions = {
  allowReauth?: boolean
  body?: unknown
  method?: string
  pathname: string
  playerId: number
  world: string
}

function buildNotifyApiUrl(pathname = '') {
  if (!API_ORIGIN) {
    throw new Error('Notify API origin is not configured')
  }

  return new URL(pathname, API_ORIGIN).toString()
}

async function requestNotifyApiJsonOnce(
  token: string,
  {
    body = null,
    method = 'GET',
    pathname,
  }: RequestNotifyApiJsonOptions,
) {
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
  }
  const init: RequestInit = {
    method,
    headers,
  }

  if (body !== null) {
    headers['content-type'] = 'application/json; charset=utf-8'
    init.body = JSON.stringify(body)
  }

  const response = await fetch(buildNotifyApiUrl(pathname), init)
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json().catch(() => null)
    : null

  return {
    payload,
    response,
  }
}

function createApiError(
  pathname: string,
  method: string,
  status: number,
  payload: any,
) {
  return new AuthRequestError(
    status,
    `[notify:${method.toLowerCase()}] ${pathname} ${status} ${payload?.message || payload?.error || 'Request failed'}`,
  )
}

export async function requestNotifyApiJson(options: RequestNotifyApiJsonOptions) {
  const {
    allowReauth = true,
    method = 'GET',
    pathname,
    playerId,
    world,
  } = options
  let token = await ensureNotifyToken(world, playerId)
  let { payload, response } = await requestNotifyApiJsonOnce(token, options)

  if (!response.ok && allowReauth && [401, 406].includes(Number(response.status || 0))) {
    token = await refreshNotifyToken(world, playerId)
    ;({ payload, response } = await requestNotifyApiJsonOnce(token, options))
  }

  if (!response.ok) {
    throw createApiError(pathname, method, response.status, payload)
  }

  return payload
}
