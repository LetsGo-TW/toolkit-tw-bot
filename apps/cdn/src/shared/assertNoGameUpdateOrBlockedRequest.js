import { assertNoGameUpdateOrBlockedRequest as assertNoGameUpdateOrBlockedRequestBase } from '@toolkit-tw-bot/document'
import { printMessage } from "../components/printMessage"

const RELOAD_DELAY_MS = 5000
const RELOAD_COOLDOWN_MS = 30000
const SESSION_RELOAD_KEY = "GO#tw-special:last-reload-at"

const canScheduleReload = () => {
  try {
    const now = Date.now()
    const last = Number(sessionStorage.getItem(SESSION_RELOAD_KEY) || 0)

    if (Number.isFinite(last) && last > 0 && (now - last) < RELOAD_COOLDOWN_MS) {
      return false
    }

    sessionStorage.setItem(SESSION_RELOAD_KEY, String(now))
    return true
  } catch {
    return true
  }
}

const scheduleReload = (delayMs = RELOAD_DELAY_MS) => {
  if (typeof window === "undefined" || typeof window.location?.reload !== "function") {
    return false
  }

  if (!canScheduleReload()) return false

  window.setTimeout(() => {
    window.location.reload()
  }, Number(delayMs) > 0 ? Number(delayMs) : RELOAD_DELAY_MS)

  return true
}

export function assertNoGameUpdateOrBlockedRequest(
  html = document,
  {
    context = "request",
    reload = true,
    delayMs = RELOAD_DELAY_MS
  } = {}
) {
  try {
    assertNoGameUpdateOrBlockedRequestBase(html, { context })
  } catch (error) {
    const shouldReload = reload === true
    const message = error?.message || "Tribal Wars retornou uma tela de erro."

    printMessage.warn(message, delayMs)

    if (shouldReload) {
      scheduleReload(delayMs)
    }

    error.goShouldReload = shouldReload
    throw error
  }
}
