/// <reference types="chrome" />

import type { SWMessage } from '../../../types'
import { syncTabActionByTabId } from '../../action-state'
import { VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE } from '../../message/types'
import { normalizeNumber, normalizeString } from '../../normalize'
import { getPopupState, type PopupStateRequest } from '../../popup-state'
import { getOpenTwTabIds } from '../../prepared-context'
import { reconcileActiveRunner } from '../../runtime'
import { ensureWorldPlayerLicense } from './ensure-world-player-license'

type VerifyWorldPlayerLicenseRequest = Partial<SWMessage> & PopupStateRequest & {
  world?: unknown
  playerId?: unknown
}

export async function verifyWorldPlayerLicense(
  request: VerifyWorldPlayerLicenseRequest = {},
) {
  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)

  if (!world) {
    return {
      ok: false,
      error: 'Missing world',
      type: VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE,
    }
  }

  if (playerId === null) {
    return {
      ok: false,
      error: 'Missing playerId',
      type: VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE,
    }
  }

  const result = await ensureWorldPlayerLicense(world, playerId, 'button')

  if (result?.attemptedPost) {
    await reconcileActiveRunner(VERIFY_WORLD_PLAYER_LICENSE_MESSAGE_TYPE)
    const openTwTabIds = await getOpenTwTabIds()
    await Promise.all(
      openTwTabIds.map((tabId) => syncTabActionByTabId(tabId)),
    )
  }

  return getPopupState(request)
}
