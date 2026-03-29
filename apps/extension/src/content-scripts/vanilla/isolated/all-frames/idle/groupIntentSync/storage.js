import { readCurrentGroupIntentContext, toFiniteNumber } from "./context"
import {
  getChromeStorageArea,
  hasChromeRuntimeError,
  hasExtensionContext
} from "./extension-context"

const STORAGE_PREFIX = "go-group-intent-sync"
const STORAGE_AREA_PRIORITY = ["local", "session"]

const resolveStorageAreas = () => STORAGE_AREA_PRIORITY
  .map((areaName) => ({
    areaName,
    area: getChromeStorageArea(areaName)
  }))
  .filter(({ area }) => Boolean(area?.get && area?.set))

const storageGetFromArea = async (area, key) => {
  if (!hasExtensionContext() || !area?.get || !key) return null

  try {
    return await new Promise((resolve) => {
      area.get([key], (result) => {
        if (hasChromeRuntimeError()) {
          resolve(null)
          return
        }

        resolve(result || {})
      })
    })
  } catch {
    return null
  }
}

const storageSetInArea = async (area, payload) => {
  if (!hasExtensionContext() || !area?.set || !payload) return false

  try {
    return await new Promise((resolve) => {
      area.set(payload, () => {
        resolve(!hasChromeRuntimeError())
      })
    })
  } catch {
    return false
  }
}

const storageGet = async (key) => {
  if (!hasExtensionContext() || !key) return {}

  for (const { area } of resolveStorageAreas()) {
    const result = await storageGetFromArea(area, key)
    if (result) return result
  }

  return {}
}

const storageSet = async (payload) => {
  if (!hasExtensionContext() || !payload) return false

  for (const { area } of resolveStorageAreas()) {
    const ok = await storageSetInArea(area, payload)
    if (ok) return true
  }

  return false
}

export const readGroupIntentStorageValue = async (key) => {
  if (!key) return null

  const result = await storageGet(key)
  return result?.[key] || null
}

export const writeGroupIntentStorageValue = async (key, value) => {
  if (!key) return false
  return await storageSet({ [key]: value })
}

export const buildGroupIntentStorageKey = (context = readCurrentGroupIntentContext()) => {
  const playerId = toFiniteNumber(context?.player_id, null)
  if (!Number.isFinite(playerId)) return null

  const world = String(context?.world || context?.host || "").trim().toLowerCase()
  if (!world) return null

  return `${STORAGE_PREFIX}:${world}:${playerId}`
}

export const readGroupIntentFix = async (context = readCurrentGroupIntentContext()) => {
  const key = buildGroupIntentStorageKey(context)
  if (!key) return null

  return await readGroupIntentStorageValue(key)
}

export const writeGroupIntentFix = async (payload = {}, context = readCurrentGroupIntentContext()) => {
  const key = buildGroupIntentStorageKey(context)
  const groupId = toFiniteNumber(payload?.group_id, toFiniteNumber(context?.group_id, null))

  if (!key || !Number.isFinite(groupId)) return null

  const nextPayload = {
    world: String(context?.world || ""),
    player_id: toFiniteNumber(context?.player_id, null),
    village_id: toFiniteNumber(context?.village_id, null),
    group_id: groupId,
    source: String(payload?.source || "unknown"),
    href: String(payload?.href || context?.href || ""),
    updated_at: Date.now()
  }

  const ok = await writeGroupIntentStorageValue(key, nextPayload)
  return ok ? nextPayload : null
}

export const syncGroupIntentFixFromCurrentPage = async ({
  source = "page-load",
  force = true
} = {}) => {
  const context = readCurrentGroupIntentContext()
  const stored = await readGroupIntentFix(context)
  const currentGroupId = toFiniteNumber(context?.group_id, null)

  if (!Number.isFinite(currentGroupId)) {
    return stored || null
  }

  if (!force && stored) return stored

  return await writeGroupIntentFix({
    group_id: currentGroupId,
    source,
    href: context.href
  }, context)
}

export default {
  buildGroupIntentStorageKey,
  readGroupIntentStorageValue,
  readGroupIntentFix,
  writeGroupIntentFix,
  writeGroupIntentStorageValue,
  syncGroupIntentFixFromCurrentPage
}
