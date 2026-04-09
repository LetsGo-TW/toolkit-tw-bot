/// <reference types="chrome" />

import type { ExtensionLicenseState } from '../types'
import { getPlayerEnabledByUser } from './enabled-by-user'
import { getPlayerReconnectOnSessionExpired } from './reconnect-on-session-expired'
import { resolveWorldPlayer, type WorldPlayerRecord } from './world-players'
import { runtimeAllowedByLicense, runtimeLicenseState } from './world-players/runtime'

export type EvaluateWorldPlayerStateArgs = {
  scopeKey?: string | null
  world?: string | null
  t?: number | null
  playerId?: number | null
  playerName?: string | null
  worldPlayer?: WorldPlayerRecord | null
}

export type EvaluatedWorldPlayerState = {
  scopeKey: string | null
  world: string | null
  t: number | null
  playerId: number | null
  playerName: string | null
  worldPlayer: WorldPlayerRecord | null
  enabledByUser: boolean | null
  reconnectOnSessionExpired: boolean | null
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
  license: ExtensionLicenseState
  isMdfScope: boolean
}

export async function evaluateWorldPlayerState({
  scopeKey = null,
  world = null,
  t = null,
  playerId = null,
  playerName = null,
  worldPlayer = null,
}: EvaluateWorldPlayerStateArgs = {}): Promise<EvaluatedWorldPlayerState> {
  const resolvedWorldPlayer = worldPlayer ?? resolveWorldPlayer({
    scopeKey,
    world,
    playerId,
  })
  const resolvedWorld = world ?? resolvedWorldPlayer?.world ?? null
  const resolvedT = t ?? null
  const resolvedPlayerId = playerId ?? resolvedWorldPlayer?.playerId ?? null
  const resolvedPlayerName = playerName ?? resolvedWorldPlayer?.playerName ?? null
  const enabledByUser = resolvedWorldPlayer
    ? resolvedWorldPlayer.enabledByUser === true
    : resolvedWorld && typeof resolvedPlayerId === 'number'
      ? getPlayerEnabledByUser(resolvedWorld, resolvedPlayerId)
      : null
  const reconnectOnSessionExpired = resolvedWorldPlayer
    ? resolvedWorldPlayer.reconnectOnSessionExpired === true
    : resolvedWorld && typeof resolvedPlayerId === 'number'
      ? getPlayerReconnectOnSessionExpired(resolvedWorld, resolvedPlayerId)
      : null
  const {
    isAllowedByLicense,
    isLicenseExpiring,
  } = await runtimeAllowedByLicense(resolvedWorldPlayer)
  const license = await runtimeLicenseState(resolvedWorldPlayer)

  return {
    scopeKey,
    world: resolvedWorld,
    t: resolvedT,
    playerId: resolvedPlayerId,
    playerName: resolvedPlayerName,
    worldPlayer: resolvedWorldPlayer,
    enabledByUser,
    reconnectOnSessionExpired,
    isAllowedByLicense,
    isLicenseExpiring,
    license,
    isMdfScope: resolvedT !== null,
  }
}
