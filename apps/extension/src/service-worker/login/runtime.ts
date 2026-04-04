/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import type { SWMessage } from '../../types'
import { ensureEnabledByUserLoaded, getPlayerEnabledByUser } from '../enabled-by-user'
import { LOGIN_MESSAGE_TYPE } from '../message/types'
import { normalizeStrictBoolean } from '../normalize'
import { ensurePreparedContextLoaded, getTabContext, getWorldFromUrl } from '../prepared-context'
import {
  ensureReconnectOnSessionExpiredLoaded,
  getPlayerReconnectOnSessionExpired,
} from '../reconnect-on-session-expired'
import {
  ensureRunnerTabsLoaded,
  getRunnerByScope,
  getRunnerForTab,
} from '../runner-tabs'
import { ensureWorldPlayersLoaded, getWorldPlayerByScopeKey } from '../world-players'
import { runtimeAllowedByLicense } from '../world-players/runtime'

type LoginRequest = Partial<SWMessage> & {
  isReconnectable?: unknown
}

function isMdfScopeKey(scopeKey?: string | null) {
  if (!scopeKey) {
    return false
  }

  const [, tValue] = scopeKey.split(':')

  return typeof tValue === 'string' && tValue.length > 0 && tValue !== 'main'
}

function buildReconnectUrl(world?: string | null) {
  return world
    ? `https://www.tribalwars.com.br/page/play/${world}`
    : null
}

export async function handleLogin(request: LoginRequest = {}, sender: chrome.runtime.MessageSender) {
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()
  await ensureReconnectOnSessionExpiredLoaded()
  await ensureRunnerTabsLoaded()
  await ensureWorldPlayersLoaded()

  const tabId = sender.tab?.id
  const senderWindowId = sender.tab?.windowId
  const tabContext = typeof tabId === 'number'
    ? getTabContext(tabId)
    : null
  const runnerForSenderTab = (
    typeof tabId === 'number'
    && typeof senderWindowId === 'number'
  )
    ? getRunnerForTab(tabId, senderWindowId)
    : null
  const scopeKey = tabContext?.scopeKey ?? runnerForSenderTab?.scopeKey ?? null
  const currentRunner = scopeKey
    ? getRunnerByScope(scopeKey)
    : runnerForSenderTab
  const worldPlayer = scopeKey
    ? getWorldPlayerByScopeKey(scopeKey)
    : null
  const urlParams = getParamsUrl(sender.tab?.url || '')
  const world = currentRunner?.world ?? worldPlayer?.world ?? tabContext?.world ?? getWorldFromUrl(sender.tab?.url) ?? null
  const playerId = tabContext?.playerId ?? worldPlayer?.playerId ?? null
  const isMdfScope = isMdfScopeKey(scopeKey)
  const enabledByUser = getPlayerEnabledByUser(world, playerId)
  const reconnectOnSessionExpired = getPlayerReconnectOnSessionExpired(world, playerId)
  const {
    isAllowedByLicense,
    isLicenseExpiring,
  } = await runtimeAllowedByLicense(worldPlayer)
  const isReconnectable = normalizeStrictBoolean(request.isReconnectable) === true
  const isRunningTab = Boolean(
    currentRunner
    && typeof tabId === 'number'
    && typeof senderWindowId === 'number'
    && currentRunner.tabId === tabId
    && currentRunner.windowId === senderWindowId
  )
  const canReconnect = Boolean(
    isRunningTab
    && !isMdfScope
    && urlParams.isInLogin
    && urlParams.sessionExpired
    && world
    && enabledByUser
    && reconnectOnSessionExpired
    && isAllowedByLicense
    && isReconnectable
  )
  const shouldCloseTab = Boolean(
    isMdfScope
    && urlParams.isInLogin
    && typeof tabId === 'number'
  )

  if (shouldCloseTab) {
    try {
      await chrome.tabs.remove(tabId as number)
    } catch {
      // ignore stale tab removal failures
    }
  }

  return {
    ok: true,
    extensionId: RELEASE_EXTENSION_ID,
    type: LOGIN_MESSAGE_TYPE,
    context: 'LOGIN',
    scopeKey,
    world,
    playerId,
    isRunningTab,
    reconnectOnSessionExpired,
    enabledByUser,
    isAllowedByLicense,
    isReconnectable,
    isMdfScope,
    shouldCloseTab,
    canReconnect,
    reconnectUrl: buildReconnectUrl(world),
    data: {
      isRunningTab,
      enabledByUser,
      isAllowedByLicense,
      isLicenseExpiring,
      isReconnectState: true,
      isReconnectEnabled: !isMdfScope && reconnectOnSessionExpired && isReconnectable,
      isMdfScope,
    },
  }
}
