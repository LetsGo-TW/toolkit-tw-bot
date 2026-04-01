/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import { SET_ENABLED_BY_USER_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeStrictBoolean } from '../normalize'
import { getPopupState, type PopupStateRequest } from '../popup-state'
import { ensurePreparedContextLoaded, getTabIdsByPlayerId } from '../prepared-context'
import { reconcileActiveRunner } from '../runtime'
import { ensureEnabledByUserLoaded, setPlayerEnabledByUserByPlayerId } from './index'

type SetEnabledByUserRequest = Partial<SWMessage> & PopupStateRequest & {
  playerId?: unknown
  enabledByUser?: unknown
}

export async function setEnabledByUser(request: SetEnabledByUserRequest = {}) {
  await ensureEnabledByUserLoaded()
  await ensurePreparedContextLoaded()

  const playerId = normalizeNumber(request.playerId)
  const enabledByUser = normalizeStrictBoolean(request.enabledByUser)

  if (playerId === null) {
    return {
      ok: false,
      error: 'Missing playerId',
      type: SET_ENABLED_BY_USER_MESSAGE_TYPE,
    }
  }

  if (enabledByUser === null) {
    return {
      ok: false,
      error: 'Missing enabledByUser',
      type: SET_ENABLED_BY_USER_MESSAGE_TYPE,
    }
  }

  await setPlayerEnabledByUserByPlayerId(playerId, enabledByUser)
  await reconcileActiveRunner(SET_ENABLED_BY_USER_MESSAGE_TYPE)
  await Promise.all(
    getTabIdsByPlayerId(playerId).map((tabId) => syncTabActionByTabId(tabId)),
  )

  return getPopupState(request)
}
