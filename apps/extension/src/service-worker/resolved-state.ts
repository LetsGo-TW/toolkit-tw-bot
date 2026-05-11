/// <reference types="chrome" />

import type { ExtensionLicenseState, SmartSessionConfig } from '../types'
import { getPlayerEnabledByUser } from './enabled-by-user'
import { getPlayerSessionManagementConfig } from './session-management'
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
  smartSession: SmartSessionConfig | null
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
  const sessionManagement = (
    resolvedWorld
    && typeof resolvedPlayerId === 'number'
  )
    ? await getPlayerSessionManagementConfig(resolvedWorld, resolvedPlayerId)
    : null
  const reconnectOnSessionExpired = sessionManagement?.reconnectOnSessionExpired ?? null
  const smartSession = sessionManagement?.smartSession ?? null
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
    smartSession,
    isAllowedByLicense,
    isLicenseExpiring,
    license,
    isMdfScope: resolvedT !== null,
  }
}
