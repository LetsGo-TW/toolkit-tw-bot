import { printMessage } from "../components/printMessage"
import { blockedRequestActive, gameUpdateActive } from "./twNotRunning"

const RELOAD_DELAY_MS = 5000
const RELOAD_COOLDOWN_MS = 30000
const SESSION_RELOAD_KEY = "GO#tw-special:last-reload-at"

const normalizeText = (value = "") => String(value || "").replace(/\s+/g, " ").trim()

const extractTwSpecialMessage = (html = document) => {
  const selectors = [
    "#error > div.center > div.content.box-border.red > div.inner > div.full-content",
    "#error .full-content",
    "#error .inner",
    "#content_value div.error_box",
    "div.error_box"
  ]

  for (const selector of selectors) {
    const text = normalizeText(html?.querySelector?.(selector)?.textContent || "")

    if (text) return text
  }

  const fallback = normalizeText(
    html?.querySelector?.("#error")?.textContent
    || html?.body?.textContent
    || ""
  )

  if (!fallback) return null

  return fallback.slice(0, 240)
}

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
  const isGameUpdate = gameUpdateActive(html)
  const isBlockedRequest = blockedRequestActive(html)

  if (!isGameUpdate && !isBlockedRequest) return

  const fallbackMessage = isGameUpdate
    ? "Tribal Wars retornou uma tela de atualização do jogo."
    : "Tribal Wars retornou uma tela de solicitação bloqueada."

  const message = extractTwSpecialMessage(html) || fallbackMessage
  const shouldReload = reload === true

  printMessage.warn(message, delayMs)

  if (shouldReload) {
    scheduleReload(delayMs)
  }

  const error = new Error(message)
  error.cause = isGameUpdate ? "GameUpdate" : "BlockedRequest"
  error.goContext = context
  error.goShouldReload = shouldReload

  throw error
}
