/// <reference types="chrome" />

import {
  ensureWorldPlayersLoaded,
  getWorldPlayer,
  setWorldPlayerEnabledByUser,
} from '../world-players'

const ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY = 'enabledByUserByPlayerId'

let cacheLoaded = false

export async function ensureEnabledByUserLoaded() {
  if (cacheLoaded) {
    return
  }

  await ensureWorldPlayersLoaded()

  const stored = await chrome.storage.local.get([ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY])

  if (stored[ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY] !== undefined) {
    await chrome.storage.local.remove(ENABLED_BY_USER_BY_PLAYER_ID_STORAGE_KEY)
  }

  cacheLoaded = true
}

export function getPlayerEnabledByUser(
  world?: string | null,
  playerId?: number | null,
) {
  return getWorldPlayer(world, playerId)?.enabledByUser === true
}

export async function setPlayerEnabledByUser(
  world: string,
  playerId: number,
  enabledByUser: boolean,
) {
  return setWorldPlayerEnabledByUser({
    world,
    playerId,
    enabledByUser,
  })
}
