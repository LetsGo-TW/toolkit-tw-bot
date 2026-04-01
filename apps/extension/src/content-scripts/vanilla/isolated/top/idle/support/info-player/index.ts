/// <reference types="chrome" />

import {
  ProtectingBot,
  searchPlayerImageUrl,
} from '@toolkit-tw-bot/browser'
import { SET_PLAYER_AVATAR_MESSAGE_TYPE } from '../../../../../../../service-worker/message/types'
import { SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE } from '../message-types'
import { CurrentGameData, getCurrentGameData, getCurrentUrl, isFinitePlayerId } from '../current'
import { fetchCurrentDocument } from '../fetchCurrentDocument'

function isCurrentPlayerInfoPlayerScreen(
  url: URL,
  gameData: CurrentGameData,
) {
  if (url.searchParams.get('screen') !== 'info_player') {
    return false
  }

  const currentPlayerId = Number(gameData?.player?.id || 0)
  const infoPlayerId = Number(url.searchParams.get('id') || 0)

  return !infoPlayerId || infoPlayerId === currentPlayerId
}

function createCurrentPlayerInfoPlayerUrl(gameData: CurrentGameData) {
  return new URL(`${gameData.link_base_pure}info_player`, window.location.origin)
}

async function persistAvatar({
  gameData,
  avatarUrl,
  isProtectBot
}: {
  gameData: CurrentGameData | undefined
  isProtectBot: boolean
  avatarUrl?: string | null
}) {
  return chrome.runtime.sendMessage({
    extensionId: chrome.runtime.id,
    type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    gameData,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
    isProtectBot
  })
}

async function syncAvatarFromDocument(
  doc: Document,
) {
  const isProtectBot = ProtectingBot['bot-protect-all-in-game'].active(doc)

  const avatarUrl = searchPlayerImageUrl(doc) || null

  return persistAvatar({
    gameData: getCurrentGameData(doc),
    avatarUrl,
    isProtectBot
  })
}

export async function infoPlayer() {
  const gameData = getCurrentGameData()

  if (!gameData) {
    return null
  }

  const currentUrl = getCurrentUrl()

  if (!isCurrentPlayerInfoPlayerScreen(currentUrl, gameData)) {
    return null
  }

  return syncAvatarFromDocument(document)
}

export async function syncPlayerAvatar() {
  const gameData = getCurrentGameData()

  if (!gameData) return;

  const currentUrl = getCurrentUrl()

  if (isCurrentPlayerInfoPlayerScreen(currentUrl, gameData)) {
    return syncAvatarFromDocument(document)
  }

  const infoPlayerUrl = createCurrentPlayerInfoPlayerUrl(gameData)

  if (ProtectingBot['bot-protect-all-in-game'].active(document)) {
    return syncAvatarFromDocument(document)
  }
  
  const fetched = await fetchCurrentDocument(infoPlayerUrl?.toString())

  if (!fetched) {
    return {
      ok: false,
      error: 'Missing current player context',
    }
  }

  return syncAvatarFromDocument(fetched.html)
}

export function isSupportInfoPlayerMessage(received: unknown) {
  return (
    received
    && typeof received === 'object'
    && (received as { type?: string }).type === SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE
  )
}
