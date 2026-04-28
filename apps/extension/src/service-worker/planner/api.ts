import { scheduleLicenseAlarm } from '../world-players/license/alarm'
import { ensureToken } from '../world-players/license/ensure-token'
import { AuthRequestError } from '../world-players/license/issue'
import { refreshToken } from '../world-players/license/refresh-token'

const API_ORIGIN = process.env.EXTENSION_API_ORIGIN

type RequestPlannerApiJsonOptions = {
  allowReauth?: boolean
  body?: unknown
  method?: string
  pathname: string
  playerId: number
  world: string
}

function buildPlannerApiUrl(pathname = '') {
  if (!API_ORIGIN) {
    throw new Error('Planner API origin is not configured')
  }

  return new URL(pathname, API_ORIGIN).toString()
}

async function ensurePlannerToken(world: string, playerId: number) {
  const token = await ensureToken(world, playerId)

  if (!token) {
    throw new AuthRequestError(401, '[planner:auth] token unavailable')
  }

  return token
}

async function refreshPlannerToken(world: string, playerId: number) {
  const refreshed = await refreshToken(world, playerId, {
    schedule: scheduleLicenseAlarm,
  })
  const token = refreshed?.token ?? null

  if (!token) {
    throw new AuthRequestError(401, '[planner:auth] token refresh failed')
  }

  return token
}

async function requestPlannerApiJsonOnce(
  token: string,
  {
    body = null,
    method = 'GET',
    pathname,
  }: RequestPlannerApiJsonOptions,
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

  const response = await fetch(buildPlannerApiUrl(pathname), init)
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
    `[planner:${method.toLowerCase()}] ${pathname} ${status} ${payload?.message || payload?.error || 'Request failed'}`,
  )
}

export async function requestPlannerApiJson(options: RequestPlannerApiJsonOptions) {
  const {
    allowReauth = true,
    method = 'GET',
    pathname,
    playerId,
    world,
  } = options
  let token = await ensurePlannerToken(world, playerId)
  let { payload, response } = await requestPlannerApiJsonOnce(token, options)

  if (!response.ok && allowReauth && [401, 406].includes(Number(response.status || 0))) {
    token = await refreshPlannerToken(world, playerId)
    ;({ payload, response } = await requestPlannerApiJsonOnce(token, options))
  }

  if (!response.ok) {
    throw createApiError(pathname, method, response.status, payload)
  }

  return payload
}
