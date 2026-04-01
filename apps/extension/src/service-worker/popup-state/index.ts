/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { createLicenseState, type SWMessage } from '../../types'
import { ensureEnabledByUserLoaded, getPlayerEnabledByUser } from '../enabled-by-user'
import { GET_POPUP_STATE_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber } from '../normalize'
import { ensurePlayerAvatarLoaded, getPlayerAvatar } from '../player-avatar'
import {
  ensurePreparedContextLoaded,
  getTabContext,
  getTabUrl,
  getWorldFromUrl,
  isTribalWarsUrl,
} from '../prepared-context'
import { ensureRunnerTabsLoaded, getRunnerForTab } from '../runner-tabs'

export type PopupStateRequest = Partial<SWMessage> & {
  targetTabId?: unknown
  targetWindowId?: unknown
}

async function getActivePopupTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    windowType: 'normal',
  })

  return tabs.find((tab) => typeof tab.id === 'number') || null
}

async function getRequestedPopupTab({ targetTabId, targetWindowId }: PopupStateRequest = {}) {
  const requestedTabId = normalizeNumber(targetTabId)
  const requestedWindowId = normalizeNumber(targetWindowId)

  if (typeof requestedTabId === 'number') {
    try {
      const tab = await chrome.tabs.get(requestedTabId)

      if (
        typeof tab.id === 'number'
        && typeof tab.windowId === 'number'
        && (requestedWindowId === null || tab.windowId === requestedWindowId)
      ) {
        return tab
      }
    } catch {
      // Fall back to the global active tab lookup when the popup target is unavailable.
    }
  }

  return getActivePopupTab()
}

export async function getPopupState(request: PopupStateRequest = {}) {
  await ensureEnabledByUserLoaded()
  await ensurePreparedContextLoaded()
  await ensureRunnerTabsLoaded()
  await ensurePlayerAvatarLoaded()

  const tab = await getRequestedPopupTab(request)

  if (!tab || typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return {
      ok: true,
      type: GET_POPUP_STATE_MESSAGE_TYPE,
      supported: false,
      reason: 'NO_ACTIVE_TAB',
    }
  }

  const tabUrl = getTabUrl(tab)
  const isSupported = isTribalWarsUrl(tabUrl)
  const tabContext = getTabContext(tab.id)
  const currentRunner = getRunnerForTab(tab.id, tab.windowId)
  const urlParams = tabUrl ? getParamsUrl(tabUrl) : {}
  const fallbackContext = urlParams.isInLogin ? 'LOGIN' : null
  const license = createLicenseState()
  const playerAvatar = getPlayerAvatar(
    tabContext?.world ?? null,
    tabContext?.playerId ?? null,
  )

  return {
    ok: true,
    type: GET_POPUP_STATE_MESSAGE_TYPE,
    supported: isSupported,
    tabId: tab.id,
    windowId: tab.windowId,
    title: tab.title || null,
    url: tabUrl,
    context: tabContext?.context ?? fallbackContext,
    world: tabContext?.world ?? getWorldFromUrl(tabUrl) ?? null,
    t: tabContext?.t ?? urlParams.t ?? null,
    playerId: tabContext?.playerId ?? null,
    playerName: tabContext?.playerName ?? null,
    avatarUrl: playerAvatar?.avatarUrl ?? null,
    avatarUpdatedAt: playerAvatar?.updatedAt ?? null,
    enabledByUser: tabContext?.world && typeof tabContext?.playerId === 'number'
      ? getPlayerEnabledByUser(tabContext.world, tabContext.playerId)
      : null,
    isTryConfirm: tabContext?.isTryConfirm === true || urlParams.isTryConfirm === true,
    active: Boolean(
      currentRunner
      && currentRunner.tabId === tab.id
      && currentRunner.windowId === tab.windowId
    ),
    ready: Boolean(tabContext),
    license,
  }
}
