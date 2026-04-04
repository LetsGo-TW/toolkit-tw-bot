/// <reference types="chrome" />

export const PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY = 'playerAvatarByScopeKey'

export async function cleanupLegacyPlayerAvatarStorage() {
  await chrome.storage.local.remove(PLAYER_AVATAR_BY_SCOPE_KEY_STORAGE_KEY)
}
