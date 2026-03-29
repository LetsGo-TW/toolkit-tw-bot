import { readCurrentGroupIntentContext, toFiniteNumber } from "./context"
import {
  readGroupIntentFix,
  syncGroupIntentFixFromCurrentPage,
  writeGroupIntentFix
} from "./storage"

const SOURCE_PAGE_LOAD = "page-load"
const SOURCE_MANUAL = "manual"

export const createGroupIntentFixState = () => {
  let currentFix = null

  const readContext = () => readCurrentGroupIntentContext()

  const setCurrentFix = (groupId) => {
    currentFix = toFiniteNumber(groupId, currentFix)
    return currentFix
  }

  const resolveEffectiveFix = async () => {
    const context = readContext()
    const contextGroupId = toFiniteNumber(context?.group_id, null)
    try {
      const stored = await readGroupIntentFix(context)
      const storedGroupId = toFiniteNumber(stored?.group_id, null)

      currentFix = storedGroupId ?? contextGroupId ?? currentFix ?? null
    } catch {
      currentFix = contextGroupId ?? currentFix ?? null
    }

    return currentFix
  }

  const readStoredFix = async (context = readContext()) => {
    try {
      return await readGroupIntentFix(context)
    } catch {
      return null
    }
  }

  const syncFromCurrentPage = async ({
    source = SOURCE_PAGE_LOAD,
    force = true
  } = {}) => {
    let payload = null

    try {
      payload = await syncGroupIntentFixFromCurrentPage({ source, force })
    } catch {
      payload = null
    }

    setCurrentFix(payload?.group_id)
    return payload
  }

  const writeFix = async (groupId, meta = {}) => {
    let payload = null

    try {
      payload = await writeGroupIntentFix({
        group_id: groupId,
        source: String(meta?.source || SOURCE_MANUAL),
        href: String(meta?.href || window.location.href)
      }, readContext())
    } catch {
      payload = null
    }

    setCurrentFix(payload?.group_id)
    return payload
  }

  return {
    getCurrentFix: () => currentFix,
    readContext,
    readStoredFix,
    resolveEffectiveFix,
    setCurrentFix,
    syncFromCurrentPage,
    writeFix
  }
}

export default createGroupIntentFixState
