/// <reference types="chrome" />

import {
  ensureWorldPlayersLoaded,
  getWorldPlayer,
  setWorldPlayerReconnectOnSessionExpired,
} from '../world-players'

export async function ensureReconnectOnSessionExpiredLoaded() {
  await ensureWorldPlayersLoaded()
}

export function getPlayerReconnectOnSessionExpired(
  world?: string | null,
  playerId?: number | null,
) {
  return getWorldPlayer(world, playerId)?.reconnectOnSessionExpired === true
}

export async function setPlayerReconnectOnSessionExpired(
  world: string,
  playerId: number,
  reconnectOnSessionExpired: boolean,
) {
  return setWorldPlayerReconnectOnSessionExpired({
    world,
    playerId,
    reconnectOnSessionExpired,
  })
}
