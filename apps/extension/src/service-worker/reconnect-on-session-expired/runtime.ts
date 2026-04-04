/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import { SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeStrictBoolean, normalizeString } from '../normalize'
import { getPopupState, type PopupStateRequest } from '../popup-state'
import { getOpenTwTabIds } from '../prepared-context'
import {
  ensureReconnectOnSessionExpiredLoaded,
  setPlayerReconnectOnSessionExpired,
} from './index'

type SetReconnectOnSessionExpiredRequest = Partial<SWMessage> & PopupStateRequest & {
  world?: unknown
  playerId?: unknown
  reconnectOnSessionExpired?: unknown
}

export async function setReconnectOnSessionExpired(
  request: SetReconnectOnSessionExpiredRequest = {},
) {
  await ensureReconnectOnSessionExpiredLoaded()

  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)
  const reconnectOnSessionExpired = normalizeStrictBoolean(request.reconnectOnSessionExpired)

  if (!world) {
    return {
      ok: false,
      error: 'Missing world',
      type: SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE,
    }
  }

  if (playerId === null) {
    return {
      ok: false,
      error: 'Missing playerId',
      type: SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE,
    }
  }

  if (reconnectOnSessionExpired === null) {
    return {
      ok: false,
      error: 'Missing reconnectOnSessionExpired',
      type: SET_RECONNECT_ON_SESSION_EXPIRED_MESSAGE_TYPE,
    }
  }

  await setPlayerReconnectOnSessionExpired(world, playerId, reconnectOnSessionExpired)
  const openTwTabIds = await getOpenTwTabIds()
  await Promise.all(
    openTwTabIds.map((tabId) => syncTabActionByTabId(tabId)),
  )

  return getPopupState(request)
}
