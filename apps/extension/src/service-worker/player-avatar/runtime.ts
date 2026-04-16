/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { dispatchControllerForScope } from '../controller/runner-controller'
import { getTabContext } from '../prepared-context'
import { SET_PLAYER_AVATAR_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import { getRunnerByScope } from '../runner-tabs'
import { syncSenderVisibleState } from '../sync-visible-state'

type SetPlayerAvatarRequest = Partial<SWMessage> & {
  world?: unknown
  t?: unknown
  playerId?: unknown
  playerName?: unknown
  features?: unknown
  points?: unknown
  rank?: unknown
  villages?: unknown
  dateStarted?: unknown
  date_started?: unknown
  avatarUrl?: unknown
  isBotProtected?: unknown
}

export async function relayRunningTabBotProtect({
  scopeKey,
  world,
  playerId,
  playerName,
  detectedInTabId = null,
  detectedInWindowId = null,
  detectedAt = new Date().toISOString(),
}: {
  scopeKey?: string | null
  world?: string | null
  playerId?: number | null
  playerName?: string | null
  detectedInTabId?: number | null
  detectedInWindowId?: number | null
  detectedAt?: string
}) {
  const runner = getRunnerByScope(scopeKey)

  if (!scopeKey) {
    return {
      forwarded: false,
      runnerTabId: null,
      runnerWindowId: null,
      scopeKey: null,
    }
  }

  try {
    const instruction = await dispatchControllerForScope(scopeKey, {
      reason: 'bot-protect-detected:set-player-avatar',
      source: SET_PLAYER_AVATAR_MESSAGE_TYPE,
      allowFallback: false,
      executeNow: true,
      isBotProtected: true,
    })

    return {
      forwarded: Boolean(runner && instruction),
      queued: Boolean(instruction),
      runnerTabId: runner?.tabId ?? null,
      runnerWindowId: runner?.windowId ?? null,
      scopeKey,
      meta: {
        world: world ?? runner?.world ?? null,
        playerId: typeof playerId === 'number' ? playerId : null,
        playerName: playerName ?? null,
        detectedAt,
        detectedInTabId,
        detectedInWindowId,
      },
    }
  } catch (error) {
    return {
      forwarded: false,
      queued: false,
      runnerTabId: runner?.tabId ?? null,
      runnerWindowId: runner?.windowId ?? null,
      scopeKey,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function notifyRunningTabAboutBotProtect(
  sender: chrome.runtime.MessageSender | undefined,
  {
    scopeKey,
    world,
    playerId,
    playerName,
  }: {
    scopeKey?: string | null
    world?: string | null
    playerId?: number | null
    playerName?: string | null
  },
) {
  return relayRunningTabBotProtect({
    scopeKey,
    world,
    playerId,
    playerName,
    detectedInTabId: sender?.tab?.id ?? null,
    detectedInWindowId: sender?.tab?.windowId ?? null,
  })
}

export async function updatePlayerAvatar(
  request: SetPlayerAvatarRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)
  const playerName = normalizeString(request.playerName)
  const avatarUrl = normalizeString(request.avatarUrl)
  const avatarUpdatedAt = avatarUrl ? new Date().toISOString() : null
  const dateStarted = normalizeNumber(request.dateStarted ?? request.date_started)
  const isBotProtected = request.isBotProtected === true
  const syncResult = sender
    ? await syncSenderVisibleState({
      sender,
      reason: SET_PLAYER_AVATAR_MESSAGE_TYPE,
      context: 'GAME',
      world,
      t: normalizeNumber(request.t),
      playerId,
      playerName,
      features: request.features ?? null,
      points: request.points ?? null,
      rank: request.rank ?? null,
      villages: request.villages ?? null,
      dateStarted,
      isBotProtected,
      avatarUrl,
      avatarUpdatedAt,
    })
    : null
  const fallbackTabContext = (
    syncResult?.ok
      ? syncResult.tabContext
      : getTabContext(sender?.tab?.id)
  ) || null

  const botProtectRelay = isBotProtected
    ? await notifyRunningTabAboutBotProtect(sender, {
      scopeKey: fallbackTabContext?.scopeKey ?? null,
      world,
      playerId,
      playerName,
    })
    : {
      forwarded: false,
      queued: false,
      runnerTabId: null,
      runnerWindowId: null,
      scopeKey: fallbackTabContext?.scopeKey ?? null,
    }

  if (!world || playerId === null) {
    if (isBotProtected) {
      return {
        ok: true,
        type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
        world: world ?? fallbackTabContext?.world ?? null,
        playerId: playerId ?? fallbackTabContext?.playerId ?? null,
        avatarUrl,
        botProtectRelay,
      }
    }

    return {
      ok: false,
      error: !world ? 'Missing world' : 'Missing playerId',
      type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    }
  }

  const record = syncResult?.ok
    ? syncResult.worldPlayer
    : null

  return {
    ok: true,
    type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    world: record?.world ?? world,
    playerId: record?.playerId ?? playerId,
    avatarUrl: record?.avatarUrl ?? avatarUrl,
    updatedAt: record?.avatarUpdatedAt ?? null,
    botProtectRelay,
  }
}
