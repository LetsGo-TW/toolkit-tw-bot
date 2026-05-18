/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import type { SWMessage } from '../../types'
import { ensureEnabledByUserLoaded } from '../enabled-by-user'
import { LOGIN_MESSAGE_TYPE } from '../message/types'
import { normalizeStrictBoolean } from '../normalize'
import { ensurePreparedContextLoaded, getTabContext, getWorldFromUrl } from '../prepared-context'
import {
  clearReconnectRuntimeActive,
  ensureReconnectRuntimeStateLoaded,
  getReconnectRuntimeState,
  markReconnectRuntimeLoginSeen,
  planReconnectRuntime,
  RECONNECT_RUNTIME_REASONS,
  type ReconnectRuntimeReason,
} from '../reconnect-runtime-state'
import { ensureReconnectOnSessionExpiredLoaded } from '../reconnect-on-session-expired'
import {
  ensureRunnerTabsLoaded,
  getRunnerByScope,
  getRunnerForTab,
} from '../runner-tabs'
import { evaluateWorldPlayerState } from '../resolved-state'
import { ensureWorldPlayersLoaded, getWorldPlayerByScopeKey } from '../world-players'

const SESSION_EXPIRED_RECONNECT_MIN_DELAY_MS = 15_000
const SESSION_EXPIRED_RECONNECT_MAX_DELAY_MS = 30_000
const STALE_SESSION_EXPIRED_RECONNECT_MS = 60_000

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

function buildReconnectUrl(world?: string | null, currentUrl?: string | null) {
  const normalizedWorld = typeof world === 'string' && world.trim()
    ? world.trim()
    : null

  if (!normalizedWorld) {
    return null
  }

  try {
    const url = new URL(currentUrl || '')
    const { protocol, hostname } = url

    const parts = hostname.split('.')

    if (parts.length > 2) {
      parts[0] = 'www'
      return `${protocol}//${parts.join('.')}/page/play/${normalizedWorld}`
    }

    return `${protocol}//www.${hostname}/page/play/${normalizedWorld}`
  } catch {
    return `https://www.tribalwars.com.br/page/play/${normalizedWorld}`
  }
}

function getSessionExpiredReconnectAt(now = Date.now()) {
  const span = SESSION_EXPIRED_RECONNECT_MAX_DELAY_MS - SESSION_EXPIRED_RECONNECT_MIN_DELAY_MS

  return now + SESSION_EXPIRED_RECONNECT_MIN_DELAY_MS + Math.floor(Math.random() * (span + 1))
}

function isSmartReconnectReason(reason?: ReconnectRuntimeReason | null) {
  return reason === RECONNECT_RUNTIME_REASONS.SHORT_BREAK
    || reason === RECONNECT_RUNTIME_REASONS.LONG_REST
}

export async function handleLogin(request: LoginRequest = {}, sender: chrome.runtime.MessageSender) {
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()
  await ensureReconnectRuntimeStateLoaded()
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
  const urlParams = getParamsUrl(sender.tab?.url || '')
  const scopedWorldPlayer = scopeKey
    ? getWorldPlayerByScopeKey(scopeKey)
    : null
  const evaluatedState = await evaluateWorldPlayerState({
    scopeKey,
    world: currentRunner?.world ?? scopedWorldPlayer?.world ?? tabContext?.world ?? getWorldFromUrl(sender.tab?.url) ?? null,
    t: tabContext?.t ?? currentRunner?.t ?? null,
    playerId: tabContext?.playerId ?? scopedWorldPlayer?.playerId ?? null,
    playerName: tabContext?.playerName ?? scopedWorldPlayer?.playerName ?? null,
    worldPlayer: scopedWorldPlayer,
  })
  const isMdfScope = isMdfScopeKey(scopeKey)
  const world = evaluatedState.world
  const playerId = evaluatedState.playerId
  const enabledByUser = evaluatedState.enabledByUser === true
  const reconnectOnSessionExpired = evaluatedState.reconnectOnSessionExpired === true
  const isAllowedByLicense = evaluatedState.isAllowedByLicense
  const isLicenseExpiring = evaluatedState.isLicenseExpiring
  const isReconnectable = normalizeStrictBoolean(request.isReconnectable) === true
  const isRunningTab = Boolean(
    currentRunner
    && typeof tabId === 'number'
    && typeof senderWindowId === 'number'
    && currentRunner.tabId === tabId
    && currentRunner.windowId === senderWindowId
  )
  const reconnectRuntimeState = scopeKey
    ? await getReconnectRuntimeState(scopeKey)
    : null
  const canUseReconnect = Boolean(
    isRunningTab
    && !isMdfScope
    && urlParams.isInLogin
    && world
    && enabledByUser
    && isAllowedByLicense
    && isReconnectable
  )
  let reconnectReason = reconnectRuntimeState?.activeReason ?? null
  let reconnectAt = reconnectRuntimeState?.activeReconnectAt ?? null
  const now = Date.now()

  if (
    scopeKey
    && reconnectReason === RECONNECT_RUNTIME_REASONS.SESSION_EXPIRED
    && typeof reconnectAt === 'number'
    && reconnectAt < (now - STALE_SESSION_EXPIRED_RECONNECT_MS)
  ) {
    await clearReconnectRuntimeActive(scopeKey)
    reconnectReason = null
    reconnectAt = null
  }

  if (
    reconnectReason === null
    && canUseReconnect
    && urlParams.sessionExpired
    && reconnectOnSessionExpired
    && scopeKey
  ) {
    reconnectReason = RECONNECT_RUNTIME_REASONS.SESSION_EXPIRED
    reconnectAt = getSessionExpiredReconnectAt()

    await planReconnectRuntime({
      scopeKey,
      world,
      playerId,
      reason: reconnectReason,
      reconnectAt,
      plannedAt: now,
    })
  }

  if (
    reconnectReason !== null
    && scopeKey
  ) {
    await markReconnectRuntimeLoginSeen(scopeKey)
  }

  const hasManagedSessionExpiredReconnect = Boolean(
    reconnectReason === RECONNECT_RUNTIME_REASONS.SESSION_EXPIRED
    && reconnectOnSessionExpired
  )
  const canReconnect = Boolean(
    canUseReconnect
    && reconnectAt !== null
    && (
      hasManagedSessionExpiredReconnect
      || isSmartReconnectReason(reconnectReason)
    )
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
    reconnectReason,
    reconnectAt,
    enabledByUser,
    isAllowedByLicense,
    isReconnectable,
    isMdfScope,
    shouldCloseTab,
    canReconnect,
    reconnectUrl: buildReconnectUrl(world, tabContext?.url ?? sender.tab?.url ?? null),
    data: {
      isRunningTab,
      enabledByUser,
      isAllowedByLicense,
      isLicenseExpiring,
      isReconnectState: true,
      isReconnectEnabled: canReconnect,
      isMdfScope,
    },
  }
}
