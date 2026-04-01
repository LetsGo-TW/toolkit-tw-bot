const LAST_SESSION_EXPIRED_RELOAD_AT_KEY = '__toolkitTwBotLastSessionExpiredReloadAt__'
const SESSION_EXPIRED_RELOAD_DEBOUNCE_MS = 5 * 1000

type ToolkitWindow = Window & {
  [LAST_SESSION_EXPIRED_RELOAD_AT_KEY]?: number
}

export function reloadCurrentTabOnSessionExpired() {
  const scope = window as ToolkitWindow
  const now = Date.now()
  const lastHandledAt = scope[LAST_SESSION_EXPIRED_RELOAD_AT_KEY] || 0

  if ((now - lastHandledAt) < SESSION_EXPIRED_RELOAD_DEBOUNCE_MS) {
    return false
  }

  scope[LAST_SESSION_EXPIRED_RELOAD_AT_KEY] = now
  window.location.reload()
  return true
}
