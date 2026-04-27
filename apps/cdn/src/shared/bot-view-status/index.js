const GAME_RUNTIME_KEY = '__toolkitTwBotGameRuntime__'

function getGameRuntime() {
  return window[GAME_RUNTIME_KEY] || null
}

function normalizeStatusText(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

export function setBotViewExecutionStatus(text) {
  const nextText = normalizeStatusText(text)
  const runtime = getGameRuntime()

  if (!nextText) {
    runtime?.clearBotViewExecutionStatusText?.()
    return
  }

  runtime?.setBotViewExecutionStatusText?.(nextText)
}

export function clearBotViewExecutionStatus() {
  const runtime = getGameRuntime()
  runtime?.clearBotViewExecutionStatusText?.()
}

export const BotViewExecutionStatus = {
  clear: clearBotViewExecutionStatus,
  set: setBotViewExecutionStatus,
}
