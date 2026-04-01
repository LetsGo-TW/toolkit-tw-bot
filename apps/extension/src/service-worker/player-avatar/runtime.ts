/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { SET_PLAYER_AVATAR_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import { setPlayerAvatar } from './index'

type SetPlayerAvatarRequest = Partial<SWMessage> & {
  world?: unknown
  playerId?: unknown
  avatarUrl?: unknown
}

export async function updatePlayerAvatar(request: SetPlayerAvatarRequest = {}) {
  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)
  const avatarUrl = normalizeString(request.avatarUrl)

  if (!world) {
    return {
      ok: false,
      error: 'Missing world',
      type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    }
  }

  if (playerId === null) {
    return {
      ok: false,
      error: 'Missing playerId',
      type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    }
  }

  const record = await setPlayerAvatar({
    world,
    playerId,
    avatarUrl,
  })

  return {
    ok: true,
    type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    world: record.world,
    playerId: record.playerId,
    avatarUrl: record.avatarUrl,
    updatedAt: record.updatedAt,
  }
}
