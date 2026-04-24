import { scheduleLicenseAlarm } from '../world-players/license/alarm'
import { ensureToken } from '../world-players/license/ensure-token'
import { AuthRequestError } from '../world-players/license/issue'
import { refreshToken } from '../world-players/license/refresh-token'

export async function ensureNotifyToken(world: string, playerId: number) {
  const token = await ensureToken(world, playerId)

  if (!token) {
    throw new AuthRequestError(401, '[notify:auth] token unavailable')
  }

  return token
}

export async function refreshNotifyToken(world: string, playerId: number) {
  const refreshed = await refreshToken(world, playerId, {
    schedule: scheduleLicenseAlarm,
  })
  const token = refreshed?.token ?? null

  if (!token) {
    throw new AuthRequestError(401, '[notify:auth] token refresh failed')
  }

  return token
}
