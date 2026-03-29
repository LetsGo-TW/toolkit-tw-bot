import { readCurrentGroupIntentContext, toFiniteNumber } from "./context"
import {
  buildGroupIntentStorageKey,
  readGroupIntentStorageValue,
  writeGroupIntentStorageValue
} from "./storage"

const AUDIT_SUFFIX = ":audit"
const AUDIT_LIMIT = 50
const AUDIT_DEDUPE_MS = 30_000

export const buildGroupIntentAuditStorageKey = (
  context = readCurrentGroupIntentContext()
) => {
  const baseKey = buildGroupIntentStorageKey(context)
  return baseKey ? `${baseKey}${AUDIT_SUFFIX}` : null
}

export const readGroupIntentAuditTrail = async (
  context = readCurrentGroupIntentContext()
) => {
  const key = buildGroupIntentAuditStorageKey(context)
  if (!key) return { entries: [] }

  const value = await readGroupIntentStorageValue(key)
  const entries = Array.isArray(value?.entries) ? value.entries : []

  return {
    entries
  }
}

const normalizeAuditEntry = (entry = {}, context = readCurrentGroupIntentContext()) => ({
  type: String(entry?.type || "unknown"),
  source: String(entry?.source || "unknown"),
  href: String(entry?.href || context?.href || window.location.href),
  path: String(entry?.path || context?.path || ""),
  world: String(context?.world || ""),
  player_id: toFiniteNumber(context?.player_id, null),
  village_id: toFiniteNumber(context?.village_id, null),
  current_group_id: toFiniteNumber(entry?.current_group_id, toFiniteNumber(context?.group_id, null)),
  fix_group_id: toFiniteNumber(entry?.fix_group_id, null),
  explicit_group_id: toFiniteNumber(entry?.explicit_group_id, toFiniteNumber(context?.explicit_group_id, null)),
  stored_fix_source: String(entry?.stored_fix_source || ""),
  stored_fix_updated_at: toFiniteNumber(entry?.stored_fix_updated_at, null),
  timestamp: Date.now()
})

const buildAuditSignature = (entry) => [
  entry.type,
  entry.path,
  entry.current_group_id,
  entry.fix_group_id,
  entry.explicit_group_id
].join("|")

export const summarizeGroupIntentAuditTrail = (entries = []) => {
  const byType = {}
  const bySignature = {}

  entries.forEach((entry) => {
    const type = String(entry?.type || "unknown")
    const signature = buildAuditSignature(entry)

    byType[type] = (byType[type] || 0) + 1
    bySignature[signature] = (bySignature[signature] || 0) + 1
  })

  return {
    total: entries.length,
    by_type: byType,
    by_signature: bySignature
  }
}

export const appendGroupIntentAuditEntry = async (
  entry = {},
  context = readCurrentGroupIntentContext()
) => {
  const key = buildGroupIntentAuditStorageKey(context)
  if (!key) return null

  const nextEntry = normalizeAuditEntry(entry, context)
  const current = await readGroupIntentAuditTrail(context)
  const entries = Array.isArray(current?.entries) ? current.entries : []
  const lastEntry = entries[entries.length - 1] || null

  if (lastEntry) {
    const currentSignature = buildAuditSignature(nextEntry)
    const lastSignature = buildAuditSignature(lastEntry)
    const lastTimestamp = toFiniteNumber(lastEntry?.timestamp, 0)

    if (
      currentSignature === lastSignature
      && nextEntry.timestamp - lastTimestamp <= AUDIT_DEDUPE_MS
    ) {
      return lastEntry
    }
  }

  const nextEntries = [...entries, nextEntry].slice(-AUDIT_LIMIT)
  const payload = {
    entries: nextEntries,
    updated_at: nextEntry.timestamp
  }

  const ok = await writeGroupIntentStorageValue(key, payload)
  return ok ? nextEntry : null
}

export default {
  appendGroupIntentAuditEntry,
  buildGroupIntentAuditStorageKey,
  readGroupIntentAuditTrail,
  summarizeGroupIntentAuditTrail
}
