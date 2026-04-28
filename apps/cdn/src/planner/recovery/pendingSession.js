import { getGameData } from "@toolkit-tw-bot/document";
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat.js";

const PLANNER_PENDING_SEND_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PLANNER_PENDING_SEND_SESSION_PATH = ['planner', 'pending-send-session']

const plannerPendingSendSessionStorageByComposeKey = new Map()

function pickInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0))
}

function trimText(value) {
  return String(value || '').trim()
}

function getPlannerPendingSendSessionStorage() {
  try {
    const gameData = getGameData()
    const world = String(gameData?.world || window?.game_data?.world || '').trim()
    const playerId = Number(gameData?.player?.id || window?.game_data?.player?.id)
    if (!world || !Number.isFinite(playerId)) return null
    const composeKey = `${world}:${playerId}:${PLANNER_PENDING_SEND_SESSION_PATH.join(':')}`
    if (!plannerPendingSendSessionStorageByComposeKey.has(composeKey)) {
      plannerPendingSendSessionStorageByComposeKey.set(composeKey, StorageLocalCompat.create({
        world,
        playerId,
        path: PLANNER_PENDING_SEND_SESSION_PATH,
      }))
    }
    return plannerPendingSendSessionStorageByComposeKey.get(composeKey)
  } catch (_) {
    return null
  }
}

function buildTargetKey(target = null) {
  const x = Number(target?.x)
  const y = Number(target?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return ''
  return `${x}|${y}`
}

function normalizePendingCommandEntry(command = null, fallbackIndex = 0) {
  if (!command || typeof command !== 'object') return null
  const target = (command?.target && typeof command.target === 'object') ? command.target : null
  const source = (command?.source && typeof command.source === 'object') ? command.source : null
  const targetKey = buildTargetKey(target)
  const sourceVillageId = Number(source?.id ?? source?.villageId)
  if (!targetKey || !Number.isFinite(sourceVillageId)) return null
  const order = Number(command?.order)
  const targetId = Number(target?.id)
  const playerId = Number(target?.playerId)
  return {
    id: `${targetKey}:${Math.trunc(sourceVillageId)}`,
    targetKey,
    target: {
      id: Number.isFinite(targetId) ? Math.trunc(targetId) : null,
      x: Number(target?.x),
      y: Number(target?.y),
      name: trimText(target?.name) || null,
      playerId: Number.isFinite(playerId) ? Math.trunc(playerId) : null
    },
    sourceVillageId: Math.trunc(sourceVillageId),
    order: Number.isFinite(order) ? Number(order) : pickInt(fallbackIndex)
  }
}

function normalizePendingSendSession(session = null) {
  if (!session || typeof session !== 'object') return null
  const reportId = trimText(session?.reportId)
  if (!reportId) return null
  const commands = (Array.isArray(session?.commands) ? session.commands : [])
    .map((command, index) => normalizePendingCommandEntry(command, index))
    .filter(Boolean)
  const updatedAt = Number.isFinite(Number(session?.updatedAt)) ? Number(session.updatedAt) : Date.now()
  return {
    reportId,
    draftId: trimText(session?.draftId) || null,
    createdAt: Number.isFinite(Number(session?.createdAt)) ? Number(session.createdAt) : updatedAt,
    updatedAt,
    commands
  }
}

export async function readPlannerPendingSendSession() {
  const storage = getPlannerPendingSendSessionStorage()
  if (!storage) return null
  const data = await storage.get?.()
  if (!data || typeof data !== 'object') return null
  const expiresAt = Number(data?.expiresAt)
  if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
    await storage.remove?.()
    return null
  }
  return normalizePendingSendSession(data)
}

export async function writePlannerPendingSendSession(session = null) {
  const storage = getPlannerPendingSendSessionStorage()
  if (!storage || !session || typeof session !== 'object') return null
  const normalized = normalizePendingSendSession(session)
  if (!normalized) return null
  const now = Date.now()
  const payload = {
    ...normalized,
    createdAt: Number.isFinite(Number(normalized?.createdAt)) ? Number(normalized.createdAt) : now,
    updatedAt: now,
    expiresAt: now + PLANNER_PENDING_SEND_SESSION_TTL_MS
  }
  if (!payload.commands.length) {
    await storage.remove?.()
    return null
  }
  await storage.set?.(payload)
  return payload
}

export async function clearPlannerPendingSendSession({ reportId = null } = {}) {
  const storage = getPlannerPendingSendSessionStorage()
  if (!storage) return false
  if (reportId) {
    const current = await readPlannerPendingSendSession()
    if (trimText(current?.reportId) && trimText(current?.reportId) !== trimText(reportId)) return false
  }
  await storage.remove?.()
  return true
}

export async function startPlannerPendingSendSession({
  reportId = '',
  draftId = null,
  commands = []
} = {}) {
  const normalizedReportId = trimText(reportId)
  if (!normalizedReportId) return null
  return await writePlannerPendingSendSession({
    reportId: normalizedReportId,
    draftId: trimText(draftId) || null,
    commands
  })
}

export async function removePlannerPendingSendCommands({
  reportId = '',
  commandIds = []
} = {}) {
  const normalizedReportId = trimText(reportId)
  if (!normalizedReportId) return null
  const current = await readPlannerPendingSendSession()
  if (!current || trimText(current?.reportId) !== normalizedReportId) return null
  const ids = new Set(
    (Array.isArray(commandIds) ? commandIds : [])
      .map((value) => trimText(value))
      .filter(Boolean)
  )
  if (!ids.size) return current
  const nextCommands = current.commands.filter((entry) => !ids.has(trimText(entry?.id)))
  if (!nextCommands.length) {
    await clearPlannerPendingSendSession({ reportId: normalizedReportId })
    return null
  }
  return await writePlannerPendingSendSession({
    ...current,
    commands: nextCommands
  })
}
