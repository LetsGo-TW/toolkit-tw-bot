/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { GAME_STAGE_MESSAGE_TYPE } from '../message/types'
import { normalizeBoolean, normalizeNumber, normalizeString } from '../normalize'
import { upsertWorldPlayer } from './index'

type GameStageRequest = Partial<SWMessage> & {
  world?: unknown
  t?: unknown
  playerId?: unknown
  playerName?: unknown
  avatarUrl?: unknown
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

export async function stageGame(request: GameStageRequest = {}) {
  const world = normalizeString(request.world)
  const t = normalizeNumber(request.t)
  const playerId = normalizeNumber(request.playerId)
  const playerName = normalizeString(request.playerName)
  const avatarUrl = normalizeString(request.avatarUrl)
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
