/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import type { SWMessage } from '../../types'
import { syncTabActionByTabId } from '../action-state'
import { getTabContext, upsertPreparedContext } from '../prepared-context'
import {
  RUNNER_BOT_PROTECT_MESSAGE_TYPE,
  SET_PLAYER_AVATAR_MESSAGE_TYPE,
} from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import { getRunnerByScope } from '../runner-tabs'
import { upsertWorldPlayer } from '../world-players'

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

  if (!runner) {
    return {
      forwarded: false,
      runnerTabId: null,
      runnerWindowId: null,
      scopeKey: scopeKey ?? null,
    }
  }

  try {
    await chrome.tabs.sendMessage(runner.tabId, {
      extensionId: RELEASE_EXTENSION_ID,
      type: RUNNER_BOT_PROTECT_MESSAGE_TYPE,
      scopeKey: runner.scopeKey,
      data: {
        world: world ?? runner.world,
        playerId: typeof playerId === 'number' ? playerId : null,
        playerName: playerName ?? null,
        detectedAt,
        detectedInTabId,
        detectedInWindowId,
      },
    })

    return {
      forwarded: true,
      runnerTabId: runner.tabId,
      runnerWindowId: runner.windowId,
      scopeKey: runner.scopeKey,
    }
  } catch (error) {
    return {
      forwarded: false,
      runnerTabId: runner.tabId,
      runnerWindowId: runner.windowId,
      scopeKey: runner.scopeKey,
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
  const tabContext = sender
    ? await upsertPreparedContext(sender, {
      context: 'GAME',
      world,
      t: request.t,
      playerId,
      playerName,
    })
    : null
  const fallbackTabContext = tabContext || getTabContext(sender?.tab?.id)

  const botProtectRelay = isBotProtected
    ? await notifyRunningTabAboutBotProtect(sender, {
      scopeKey: fallbackTabContext?.scopeKey ?? null,
      world,
      playerId,
      playerName,
    })
    : {
      forwarded: false,
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

  const record = await upsertWorldPlayer({
    world,
    playerId,
    playerName,
    avatarUrl,
    avatarUpdatedAt,
    dateStarted,
    scopeKey: fallbackTabContext?.scopeKey ?? null,
  })

  if (typeof fallbackTabContext?.tabId === 'number') {
    await syncTabActionByTabId(fallbackTabContext.tabId)
  }

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
