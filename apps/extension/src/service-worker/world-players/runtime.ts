/// <reference types="chrome" />

import { createLicenseState, type ExtensionLicenseState } from '../../types'
import type { SWMessage } from '../../types'
import { GAME_STAGE_MESSAGE_TYPE } from '../message/types'
import { normalizeBoolean, normalizeNumber, normalizeString } from '../normalize'
import { upsertWorldPlayer, WorldPlayerLicenseRecord, WorldPlayerRecord } from './index'
import { resolveRuntimeLicense } from './license'

type GameStageRequest = Partial<SWMessage> & {
  world?: unknown
  t?: unknown
  playerId?: unknown
  playerName?: unknown
  avatarUrl?: unknown
  dateStarted?: unknown
  date_started?: unknown
  isBotProtected?: unknown
}

function createScopeKey(
  world: string | null,
  t: number | null,
) {
  if (!world) {
    return null
  }

  return `${world}:${t ?? 'main'}`
}

async function resolveWorldPlayerRuntimeLicense(license: WorldPlayerLicenseRecord) {
  const {
    status,
    isAllowedByLicense,
    isLicenseExpiring,
  } = resolveRuntimeLicense(license)

  return {
    status,
    isAllowedByLicense,
    isLicenseExpiring,
  }
}

export async function runtimeAllowedByLicense(worldPlayer: WorldPlayerRecord | null) {
  if (!worldPlayer) return {
    isAllowedByLicense: false,
    isLicenseExpiring: false
  }
  const license = worldPlayer.license
  return await resolveWorldPlayerRuntimeLicense(license)
}

export async function runtimeLicenseState(
  worldPlayer: WorldPlayerRecord | null,
): Promise<ExtensionLicenseState> {
  if (!worldPlayer) {
    return createLicenseState({
      status: 'inactive',
    })
  }

  const { status } = await resolveWorldPlayerRuntimeLicense(worldPlayer.license)

  return createLicenseState({
    status,
  })
}

export async function stageGame(request: GameStageRequest = {}) {
  const world = normalizeString(request.world)
  const t = normalizeNumber(request.t)
  const playerId = normalizeNumber(request.playerId)
  const playerName = normalizeString(request.playerName)
  const avatarUrl = normalizeString(request.avatarUrl)
  const avatarUpdatedAt = avatarUrl ? new Date().toISOString() : null
  const dateStarted = normalizeNumber(request.dateStarted ?? request.date_started)
  const isBotProtected = normalizeBoolean(request.isBotProtected)

  if (!world) {
    return {
      ok: false,
      error: 'Missing world',
      type: GAME_STAGE_MESSAGE_TYPE,
    }
  }

  const worldPlayer = playerId === null
    ? null
    : await upsertWorldPlayer({
      world,
      playerId,
      playerName,
      avatarUrl,
      avatarUpdatedAt,
      dateStarted,
      scopeKey: createScopeKey(world, t),
    })

  return {
    ok: true,
    type: GAME_STAGE_MESSAGE_TYPE,
    token: worldPlayer?.license.token ?? null,
    worldPlayer,
    isBotProtected,
  }
}
