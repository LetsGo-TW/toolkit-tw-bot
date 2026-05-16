/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import searchPlayerImageUrl from '@toolkit-tw-bot/document/searchPlayerImageUrl'
import { getParamsUrl } from '@toolkit-tw-bot/core'
import { SET_PLAYER_AVATAR_MESSAGE_TYPE } from '../../../../../../../service-worker/message/types'
import { SUPPORT_SYNC_PLAYER_AVATAR_MESSAGE_TYPE } from '../message-types'
import { CurrentGameData, getCurrentGameData, getCurrentUrl, getFreshGameBotProtectObservation, isFinitePlayerId, setCurrentGameData } from '../current'
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
  isProtectBot,
}: {
  gameData: CurrentGameData | undefined
  isProtectBot: boolean
  avatarUrl?: string | null
}) {
  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )

  const data = {
    extensionId: RELEASE_EXTENSION_ID,
    type: SET_PLAYER_AVATAR_MESSAGE_TYPE,
    world: gameData?.world,
    t: runtimeParams.t ?? null,
    playerId: isFinitePlayerId(gameData?.player?.id)
      ? gameData.player.id
      : null,
    playerName: gameData?.player?.name ?? null,
    features: gameData?.features ?? null,
    date_started: gameData?.player?.date_started ?? null,
    villages: gameData?.player?.villages ?? null,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
    points: gameData?.player?.points ?? null,
    rank: gameData?.player?.rank ?? null,
    isBotProtected: isProtectBot,
  }
  console.log('[CS][Info_player] persist: ', data)
  return chrome.runtime.sendMessage(data)
}

async function syncAvatarFromDocument(
  doc: Document,
) {
  const isProtectBot = getFreshGameBotProtectObservation(doc).active
  const currentGameData = getCurrentGameData(doc)
  setCurrentGameData(currentGameData)
  const avatarUrl = searchPlayerImageUrl(doc) || null
  return persistAvatar({
    gameData: currentGameData,
    avatarUrl,
    isProtectBot,
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

  if (!gameData) return

  const currentUrl = getCurrentUrl()

  if (isCurrentPlayerInfoPlayerScreen(currentUrl, gameData)) {
    return syncAvatarFromDocument(document)
  }

  const infoPlayerUrl = createCurrentPlayerInfoPlayerUrl(gameData)

  if (getFreshGameBotProtectObservation(document).active) {
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
