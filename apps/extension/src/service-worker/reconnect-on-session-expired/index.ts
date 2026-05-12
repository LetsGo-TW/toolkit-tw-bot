/// <reference types="chrome" />

import {
  ensureSessionManagementLoaded,
  getPlayerSessionManagementConfig,
  setPlayerReconnectOnSessionExpiredConfig,
} from '../session-management'

export async function ensureReconnectOnSessionExpiredLoaded() {
  await ensureSessionManagementLoaded()
}

export async function getPlayerReconnectOnSessionExpired(
  world?: string | null,
  playerId?: number | null,
) {
  const config = await getPlayerSessionManagementConfig(world, playerId)

  return config?.reconnectOnSessionExpired === true
}

export async function setPlayerReconnectOnSessionExpired(
  world: string,
  playerId: number,
  reconnectOnSessionExpired: boolean,
) {
  return await setPlayerReconnectOnSessionExpiredConfig(
    world,
    playerId,
    reconnectOnSessionExpired,
  )
}
