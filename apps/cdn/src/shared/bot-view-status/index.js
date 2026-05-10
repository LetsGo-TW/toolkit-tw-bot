const GAME_RUNTIME_KEY = '__toolkitTwBotGameRuntime__'

function getGameRuntime() {
  return window[GAME_RUNTIME_KEY] || null
}

function normalizeString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function normalizeNextAt(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : null
}

export function applyBotViewStatus(value = null) {
  const runtime = getGameRuntime()
  return runtime?.applyBotViewStatus?.(value) ?? false
}

export function refreshBotViewStatus() {
  const runtime = getGameRuntime()
  return runtime?.refreshBotViewStatus?.() ?? null
}

export function setBotViewCurrentTitle(text) {
  const nextText = normalizeString(text)
  const runtime = getGameRuntime()

  if (!nextText) {
    runtime?.clearBotViewCurrentTitle?.()
    return
  }

  runtime?.setBotViewCurrentTitle?.(nextText)
}

export function clearBotViewCurrentTitle() {
  const runtime = getGameRuntime()
  runtime?.clearBotViewCurrentTitle?.()
}

export function setBotViewExecutionStatus(text) {
  const nextText = normalizeString(text)
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

export function setBotViewNextStatus({
  nextAt = null,
  nextTitle = null,
} = {}) {
  const runtime = getGameRuntime()

  runtime?.setBotViewNextStatus?.({
    nextAt: normalizeNextAt(nextAt),
    nextTitle: normalizeString(nextTitle),
  })
}

export function clearBotViewNextStatus() {
  const runtime = getGameRuntime()
  runtime?.clearBotViewNextStatus?.()
}

export const BotViewStatus = {
  apply: applyBotViewStatus,
  clearCurrent: clearBotViewCurrentTitle,
  clearExecution: clearBotViewExecutionStatus,
  clearNext: clearBotViewNextStatus,
  refresh: refreshBotViewStatus,
  setCurrent: setBotViewCurrentTitle,
  setExecution: setBotViewExecutionStatus,
  setNext: setBotViewNextStatus,
}

export const BotViewExecutionStatus = {
  clear: clearBotViewExecutionStatus,
  set: setBotViewExecutionStatus,
}
