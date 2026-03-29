import {
  appendGroupIntentAuditEntry,
  readGroupIntentAuditTrail,
  summarizeGroupIntentAuditTrail
} from "./audit"
import { toFiniteNumber } from "./context"
import debugGroupIntentSync from "./debug"
import { createGroupIntentFixState } from "./fix-state"
import {
  rewriteAnchorsInRootDetailed,
  mountAnchorMutationObserver
} from "./links"
import { getChromeStorageApi, hasExtensionContext } from "./extension-context"
import { getGroupIntentMountBlockReason } from "./protections"
import { writeGroupIntentRuntimeState } from "./runtime-state"
import { buildGroupIntentStorageKey } from "./storage"

export const GROUP_INTENT_SYNC_GLOBAL_KEY = "__GO_GROUP_INTENT_SYNC__"

const SOURCE_PAGE_LOAD = "page-load"
const SOURCE_STORAGE_SYNC = "storage-sync"
const SOURCE_MANUAL = "manual"

const EMPTY_REWRITE_SUMMARY = Object.freeze({
  scanned: 0,
  rewritten: 0,
  skipped: {},
  samples: []
})

export async function mountGroupIntentSyncNavigation() {
  if (window[GROUP_INTENT_SYNC_GLOBAL_KEY]?.active) {
    return window[GROUP_INTENT_SYNC_GLOBAL_KEY]
  }

  let disposed = false
  let followUpTimeoutId = 0
  let followUpFrameId = 0
  const fixState = createGroupIntentFixState()
  const initialContext = fixState.readContext()
  const mountBlockReason = getGroupIntentMountBlockReason(initialContext)

  if (mountBlockReason) {
    writeGroupIntentRuntimeState({
      status: "skipped",
      reason: mountBlockReason,
      source: SOURCE_PAGE_LOAD,
      href: initialContext?.href || window.location.href
    })

    debugGroupIntentSync("mount-skipped", {
      reason: mountBlockReason,
      href: initialContext?.href || window.location.href,
      context: initialContext
    })

    return {
      active: false,
      skipped: true,
      reason: mountBlockReason,
      readContext: () => initialContext
    }
  }

  const rewriteDocument = async (root = document, source = SOURCE_MANUAL) => {
    const groupId = await fixState.resolveEffectiveFix()
    if (!Number.isFinite(Number(groupId))) {
      return {
        ...EMPTY_REWRITE_SUMMARY,
        skipped: { "missing-group-fix": 1 }
      }
    }

    const summary = rewriteAnchorsInRootDetailed(root, groupId)
    const event = summary.rewritten > 0 ? "links-rewritten" : "links-rewrite-summary"

    writeGroupIntentRuntimeState({
      status: "mounted",
      source,
      group_id: Number(groupId),
      href: window.location.href,
      ...summary
    })

    debugGroupIntentSync(event, {
      source,
      group_id: Number(groupId),
      ...summary
    }, {
      rateKey: `${event}:${source}:${groupId}`,
      throttleMs: 300
    })

    return summary
  }

  const scheduleFollowUpRewrites = () => {
    followUpFrameId = window.requestAnimationFrame(() => {
      if (disposed) return
      void rewriteDocument(document, SOURCE_MANUAL)
    })

    followUpTimeoutId = window.setTimeout(() => {
      if (disposed) return
      void rewriteDocument(document, SOURCE_MANUAL)
    }, 250)
  }

  const mutation = mountAnchorMutationObserver({
    getGroupFix: fixState.resolveEffectiveFix
  })

  const logAuditHistory = async (source) => {
    const history = await readGroupIntentAuditTrail(fixState.readContext())
    const entries = Array.isArray(history?.entries) ? history.entries : []

    debugGroupIntentSync("audit-history", {
      source,
      ...summarizeGroupIntentAuditTrail(entries),
      errors: entries
    })
  }

  const auditCurrentGroupDrift = async (source) => {
    const context = fixState.readContext()
    const explicitGroupId = toFiniteNumber(context?.explicit_group_id, null)
    const currentGroupId = toFiniteNumber(context?.group_id, null)
    const storedFix = await fixState.readStoredFix(context)
    const fixGroupId = toFiniteNumber(storedFix?.group_id, null)

    if (Number.isFinite(explicitGroupId)) return null
    if (!Number.isFinite(currentGroupId)) return null
    if (!Number.isFinite(fixGroupId)) return null
    if (currentGroupId === fixGroupId) return null

    const entry = await appendGroupIntentAuditEntry({
      type: "group-drift-detected",
      source,
      href: context.href,
      path: context.path,
      current_group_id: currentGroupId,
      fix_group_id: fixGroupId,
      explicit_group_id: explicitGroupId,
      stored_fix_source: String(storedFix?.source || ""),
      stored_fix_updated_at: toFiniteNumber(storedFix?.updated_at, null)
    }, context)

    if (entry) {
      debugGroupIntentSync("group-drift-detected", entry)
    }

    return entry
  }

  const onStorageChanged = async (changes) => {
    const storageKey = buildGroupIntentStorageKey(fixState.readContext())
    if (!storageKey || !changes?.[storageKey]) return

    const nextGroupId = toFiniteNumber(
      changes[storageKey]?.newValue?.group_id,
      fixState.getCurrentFix()
    )

    fixState.setCurrentFix(toFiniteNumber(
      nextGroupId,
      fixState.getCurrentFix()
    ))

    debugGroupIntentSync("storage-fix-updated", {
      storage_key: storageKey,
      group_id: nextGroupId,
      source: changes[storageKey]?.newValue?.source || SOURCE_STORAGE_SYNC
    }, {
      rateKey: `storage-fix-updated:${storageKey}:${nextGroupId}`,
      throttleMs: 150
    })

    await rewriteDocument(document, SOURCE_STORAGE_SYNC)
  }

  await auditCurrentGroupDrift(SOURCE_PAGE_LOAD)
  await logAuditHistory(SOURCE_PAGE_LOAD)

  const initialPayload = await fixState.syncFromCurrentPage({
    source: SOURCE_PAGE_LOAD,
    force: true
  })

  debugGroupIntentSync("mounted", {
    source: SOURCE_PAGE_LOAD,
    group_id: initialPayload?.group_id ?? null,
    href: initialPayload?.href || window.location.href,
    context: fixState.readContext()
  }, {
    rateKey: `mounted:${window.location.href}`
  })

  writeGroupIntentRuntimeState({
    status: "mounted",
    source: SOURCE_PAGE_LOAD,
    group_id: initialPayload?.group_id ?? null,
    href: initialPayload?.href || window.location.href
  })

  await rewriteDocument(document, SOURCE_PAGE_LOAD)
  scheduleFollowUpRewrites()

  const storageApi = getChromeStorageApi()
  let storageListener = null

  if (hasExtensionContext() && storageApi?.onChanged) {
    storageListener = (changes, areaName) => {
      void onStorageChanged(changes, areaName)
    }

    try {
      storageApi.onChanged.addListener(storageListener)
    } catch {}
  }

  const api = {
    active: true,
    readContext: fixState.readContext,
    readFix: async () => {
      const groupId = await fixState.resolveEffectiveFix()
      return Number.isFinite(Number(groupId)) ? groupId : null
    },
    rewriteNow: async () => await rewriteDocument(document, SOURCE_MANUAL),
    stop: () => {
      if (disposed) return
      disposed = true
      if (storageListener && storageApi?.onChanged) {
        try {
          storageApi.onChanged.removeListener(storageListener)
        } catch {}
      }
      window.cancelAnimationFrame(followUpFrameId)
      window.clearTimeout(followUpTimeoutId)
      mutation.disconnect()
      writeGroupIntentRuntimeState({
        status: "stopped",
        source: SOURCE_MANUAL,
        href: window.location.href
      })
      debugGroupIntentSync("stopped", {
        href: window.location.href
      }, {
        rateKey: `stopped:${window.location.href}`
      })
      delete window[GROUP_INTENT_SYNC_GLOBAL_KEY]
    },
    writeFix: async (groupId, meta = {}) => {
      const payload = await fixState.writeFix(groupId, {
        source: String(meta?.source || SOURCE_MANUAL),
        href: String(meta?.href || window.location.href)
      })
      debugGroupIntentSync("manual-fix-written", payload, {
        rateKey: `manual-fix-written:${payload?.group_id || "none"}:${payload?.href || window.location.href}`,
        throttleMs: 100
      })
      mutation.queue(document)
      return payload
    }
  }

  window[GROUP_INTENT_SYNC_GLOBAL_KEY] = api
  return api
}

export default mountGroupIntentSyncNavigation
