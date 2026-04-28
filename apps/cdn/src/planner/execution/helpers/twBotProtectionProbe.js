import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"

function trimLower(value) {
  return String(value || '').trim().toLowerCase()
}

export function isSuspiciousPayloadExecutionError(error) {
  const message = trimLower(error?.message || error)
  if (!message) return false
  return (
    message.includes('payload') ||
    message.includes('command-data-form') ||
    message.includes('sem command-data-form') ||
    message.includes('response.dialog')
  )
}

export async function probeTwBotProtectionByOverviewGet({ signal } = {}) {
  const gameData = getGameData()
  const url = new URL(`${gameData.link_base_pure}overview`, window.origin)

  const response = await fetch(url.toString(), {
    method: 'GET',
    referrerPolicy: "origin",
    credentials: 'include',
    cache: 'no-store',
    signal
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (bot-protect-probe)`)
  }

  const text = await response.text()
  const html = new DOMParser().parseFromString(text, 'text/html')

  if (ProtectingBot['bot-protect-all-in-game'].active(html)) {
    throw ProtectingBot.error()
  }

  return {
    ok: true,
    protected: false
  }
}

