import { getGameData } from "@toolkit-tw-bot/document";

const gameData = getGameData();

const STORAGE_KEY = `__plan:e:logs:${gameData.player.id}`
const MAX_LOGS_DEFAULT = 500

function safeReadLogs() {
  try {
    const raw = window?.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function safeWriteLogs(logs = []) {
  try {
    window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify(logs))
  } catch {
    // noop
  }
}

export function createExecutionLogEntry({
  mode = 'send',
  phase = 'phase1',
  status = 'info',
  villageId = null,
  target = null,
  message = '',
  meta = null,
  error = null
} = {}) {
  return {
    at: Date.now(),
    mode: String(mode || 'send'),
    phase: String(phase || 'phase1'),
    status: String(status || 'info'),
    villageId: Number.isFinite(Number(villageId)) ? Number(villageId) : null,
    target: target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))
      ? { x: Number(target.x), y: Number(target.y) }
      : null,
    message: String(message || '').trim(),
    meta: meta && typeof meta === 'object' ? meta : null,
    error: error ? String(error) : null
  }
}

export function appendExecutionLog(entry = {}, { max = MAX_LOGS_DEFAULT } = {}) {
  const maxLogs = Number.isFinite(Number(max)) ? Math.max(50, Math.floor(max)) : MAX_LOGS_DEFAULT
  const list = safeReadLogs()
  list.push(entry)
  const sliced = list.length > maxLogs ? list.slice(list.length - maxLogs) : list
  safeWriteLogs(sliced)
  return sliced
}

export function getExecutionLogs() {
  return safeReadLogs()
}

export function clearExecutionLogs() {
  safeWriteLogs([])
}

