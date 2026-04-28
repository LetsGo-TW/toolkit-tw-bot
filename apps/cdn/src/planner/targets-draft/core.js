import { getGameData } from "@toolkit-tw-bot/document";
import StorageLocalCompat from "../../shared/indexdb/storage-local-compat.js";

function cloneDraftStoreValue(value = null) {
  if (!value || typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return value
  }
}

function createDraftStorage({
  ttlMs = 7 * 24 * 60 * 60 * 1000,
  storageKey = 'planner-targets-draft'
} = {}) {
  let storageCache = null
  let rawStateCache = null
  let readyPromise = null

  const getStorage = () => {
    if (storageCache) return storageCache
    try {
      const gameData = getGameData()
      const world = String(gameData?.world || window?.game_data?.world || '').trim()
      const playerId = Number(gameData?.player?.id || window?.game_data?.player?.id)
      if (!world || !Number.isFinite(playerId)) return null
      storageCache = StorageLocalCompat.create({
        world,
        playerId,
        path: ['planner', storageKey],
      })
      return storageCache
    } catch (_) {
      return null
    }
  }

  const read = () => cloneDraftStoreValue(rawStateCache)

  const ready = async() => {
    if (readyPromise) return await readyPromise
    readyPromise = (async() => {
      const storage = getStorage()
      if (!storage) {
        rawStateCache = null
        return read()
      }
      const data = await storage.get?.()
      if (typeof data === 'undefined') {
        await storage.remove?.()
        rawStateCache = null
        return null
      }
      if (!data || typeof data !== 'object') {
        rawStateCache = null
        return null
      }
      const expiresAt = Number(data?.expiresAt)
      if (Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() > expiresAt) {
        await storage.remove?.()
        rawStateCache = null
        return null
      }
      rawStateCache = cloneDraftStoreValue(data)
      return read()
    })()
      .catch((error) => {
        console.warn('[planner:draft:storage:ready]', error?.message || error)
        rawStateCache = null
        return null
      })
    return await readyPromise
  }

  const write = async(draft) => {
    const storage = getStorage()
    if (!storage || !draft || typeof draft !== 'object') return null
    const now = Date.now()
    const createdAt = Number.isFinite(Number(draft?.createdAt)) ? Number(draft.createdAt) : now
    const payload = {
      ...draft,
      createdAt,
      updatedAt: now,
      expiresAt: now + Math.max(0, Math.floor(Number(ttlMs) || 0))
    }
    rawStateCache = cloneDraftStoreValue(payload)
    await storage.set?.(payload)
    return read()
  }

  const remove = async() => {
    const storage = getStorage()
    rawStateCache = null
    await storage?.remove?.()
  }

  const resetCache = () => {
    storageCache = null
    rawStateCache = null
    readyPromise = null
  }

  return { getStorage, read, write, remove, ready, resetCache }
}

function sanitizeDraftName(name = '') {
  const text = String(name || '')
    .replace(/[^\u0000-\u00ff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, 80)
}

function createNamedDraftId() {
  const rand = Math.random().toString(36).slice(2, 8)
  return `td_${Date.now().toString(36)}_${rand}`
}

export function sanitizeDraftDispatchStatus(status = null) {
  if (!status || typeof status !== 'object') return null
  const pickInt = (value) => Math.max(0, Math.floor(Number(value) || 0))
  const sanitizeMessages = (messages = []) => (
    Array.isArray(messages)
      ? messages.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
      : []
  )
  const sanitizeDiagnostics = (diagnostics = null) => {
    if (!diagnostics || typeof diagnostics !== 'object') return null
    const send = (diagnostics.send && typeof diagnostics.send === 'object') ? diagnostics.send : {}
    const causes = (diagnostics.causes && typeof diagnostics.causes === 'object') ? diagnostics.causes : {}
    const next = {
      send: {
        errorCount: pickInt(send.errorCount),
        messages: sanitizeMessages(send.messages)
      },
      causes: {
        captchaCount: pickInt(causes.captchaCount),
        unexpectedCount: pickInt(causes.unexpectedCount)
      }
    }
    const hasData = (
      next.send.errorCount > 0
      || next.send.messages.length > 0
      || next.causes.captchaCount > 0
      || next.causes.unexpectedCount > 0
    )
    return hasData ? next : null
  }
  const next = {
    requestedQty: pickInt(status.requestedQty),
    distributedQty: pickInt(status.distributedQty),
    remainingQty: pickInt(status.remainingQty),
    bnBlockedCount: pickInt(status.bnBlockedCount),
    sendOkQty: pickInt(status.sendOkQty),
    sendFailQty: pickInt(status.sendFailQty),
    sendPendingQty: pickInt(status.sendPendingQty),
    retryQty: pickInt(status.retryQty),
    diagnostics: sanitizeDiagnostics(status.diagnostics || null)
  }
  return (
    next.requestedQty > 0
    || next.distributedQty > 0
    || next.remainingQty > 0
    || next.bnBlockedCount > 0
    || next.sendOkQty > 0
    || next.sendFailQty > 0
    || next.sendPendingQty > 0
    || next.retryQty > 0
    || next.diagnostics
  ) ? next : null
}

export function getTargetsListCoordsSignature(targets = [], getTargetListKey = (target) => `${Number(target?.x)}|${Number(target?.y)}`) {
  return (Array.isArray(targets) ? targets : [])
    .map((target) => getTargetListKey(target))
    .filter((key) => /^\d+\|\d+$/.test(key))
    .join(',')
}

export function serializeTargetsDraft({
  targets = [],
  qtyByKey = new Map(),
  selectedKeys = new Set(),
  metaByKey = new Map(),
  seedTarget = null,
  activeTargetKey = null,
  getTargetListKey = (target) => `${Number(target?.x)}|${Number(target?.y)}`
} = {}) {
  const safeTargets = Array.isArray(targets) ? targets : []
  if (safeTargets.length <= 1) return null
  const items = safeTargets.map((target) => {
    const key = getTargetListKey(target)
    const qty = Math.max(0, Math.floor(Number(qtyByKey?.get?.(key) ?? 0) || 0))
    const selected = Boolean(selectedKeys?.has?.(key))
    const meta = metaByKey?.get?.(key) || null
    return {
      id: Number.isFinite(Number(target?.id)) ? Number(target.id) : null,
      x: Number(target?.x),
      y: Number(target?.y),
      qty,
      selected,
      dispatchStatus: sanitizeDraftDispatchStatus(meta?.dispatchStatus || null)
    }
  }).filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y))

  if (items.length <= 1) return null

  const pendingRecoveryCount = items.reduce((sum, item) => (
    sum + Math.max(0, Math.floor(Number(item?.dispatchStatus?.retryQty) || 0))
  ), 0)

  return {
    seedTarget: seedTarget ? {
      id: Number.isFinite(Number(seedTarget?.id)) ? Number(seedTarget.id) : null,
      x: Number(seedTarget?.x),
      y: Number(seedTarget?.y),
      k: Number.isFinite(Number(seedTarget?.k)) ? Number(seedTarget.k) : null
    } : null,
    activeTargetKey: String(activeTargetKey || '').trim() || null,
    targets: items,
    meta: {
      totalTargets: items.length,
      totalCommands: items.reduce((sum, item) => sum + Math.max(0, Math.floor(Number(item?.qty) || 0)), 0),
      pendingRecoveryCount
    }
  }
}

export function parseDraftTargetsItems(draft = null) {
  const list = Array.isArray(draft?.targets) ? draft.targets : []
  return list
    .map((item, index) => {
      const x = Number(item?.x)
      const y = Number(item?.y)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      return {
        id: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
        x,
        y,
        qty: Math.max(0, Math.floor(Number(item?.qty) || 0)),
        selected: Boolean(item?.selected),
        dispatchStatus: sanitizeDraftDispatchStatus(item?.dispatchStatus || null),
        _draftIndex: index
      }
    })
    .filter(Boolean)
}

function sanitizeDraftPayloadForStorage(draft = null, {
  draftId = null,
  name = null,
  preserveCreatedAt = null
} = {}) {
  if (!draft || typeof draft !== 'object') return null
  const items = parseDraftTargetsItems(draft)
  if (items.length <= 1) return null
  const pendingRecoveryCount = items.reduce((sum, item) => (
    sum + Math.max(0, Math.floor(Number(item?.dispatchStatus?.retryQty) || 0))
  ), 0)
  const totalCommands = items.reduce((sum, item) => (
    sum + Math.max(0, Math.floor(Number(item?.qty) || 0))
  ), 0)
  const seedTarget = draft?.seedTarget && typeof draft.seedTarget === 'object'
    ? {
      id: Number.isFinite(Number(draft.seedTarget?.id)) ? Number(draft.seedTarget.id) : null,
      x: Number(draft.seedTarget?.x),
      y: Number(draft.seedTarget?.y),
      k: Number.isFinite(Number(draft.seedTarget?.k)) ? Number(draft.seedTarget.k) : null
    }
    : null

  const next = {
    ...draft,
    ...(draftId ? { draftId: String(draftId) } : {}),
    targets: items.map((item) => ({
      id: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
      x: Number(item?.x),
      y: Number(item?.y),
      qty: Math.max(0, Math.floor(Number(item?.qty) || 0)),
      selected: Boolean(item?.selected),
      ...(item?.dispatchStatus ? { dispatchStatus: item.dispatchStatus } : {})
    })),
    seedTarget: (seedTarget && Number.isFinite(seedTarget.x) && Number.isFinite(seedTarget.y)) ? seedTarget : null,
    activeTargetKey: String(draft?.activeTargetKey || '').trim() || null,
    meta: {
      ...(draft?.meta && typeof draft.meta === 'object' ? draft.meta : {}),
      totalTargets: items.length,
      totalCommands,
      pendingRecoveryCount
    }
  }
  if (name != null) {
    const safeName = sanitizeDraftName(name)
    if (safeName) next.name = safeName
    else delete next.name
  }
  if (preserveCreatedAt != null) {
    const createdAt = Number(preserveCreatedAt)
    if (Number.isFinite(createdAt)) next.createdAt = createdAt
  }
  return next
}

function normalizeDraftStoreState(raw = null) {
  const legacyDraft = sanitizeDraftPayloadForStorage(raw)
  if (legacyDraft) {
    return {
      version: 2,
      lastDraft: legacyDraft,
      savedDrafts: []
    }
  }

  const version = Number(raw?.version)
  const lastDraft = sanitizeDraftPayloadForStorage(raw?.lastDraft || null)
  const savedDrafts = (Array.isArray(raw?.savedDrafts) ? raw.savedDrafts : [])
    .map((entry) => {
      const safeId = String(entry?.draftId || entry?.id || '').trim()
      const safeName = sanitizeDraftName(entry?.name || '')
      if (!safeId || !safeName) return null
      const sanitized = sanitizeDraftPayloadForStorage(entry, {
        draftId: safeId,
        name: safeName,
        preserveCreatedAt: entry?.createdAt
      })
      if (!sanitized) return null
      sanitized.draftId = safeId
      sanitized.name = safeName
      return sanitized
    })
    .filter(Boolean)
    .sort((a, b) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))

  if (version === 2 || lastDraft || savedDrafts.length > 0) {
    return {
      version: 2,
      lastDraft,
      savedDrafts
    }
  }

  return {
    version: 2,
    lastDraft: null,
    savedDrafts: []
  }
}

export function mergeTargetListsPreferCurrent(current = [], fromDraft = [], getTargetListKey = (target) => `${Number(target?.x)}|${Number(target?.y)}`) {
  const result = []
  const byKey = new Map()
  ;(Array.isArray(current) ? current : []).forEach((item) => {
    const key = getTargetListKey(item)
    if (!/^\d+\|\d+$/.test(key)) return
    byKey.set(key, item)
    result.push(item)
  })
  ;(Array.isArray(fromDraft) ? fromDraft : []).forEach((draftItem) => {
    const key = getTargetListKey(draftItem)
    if (!/^\d+\|\d+$/.test(key)) return
    if (byKey.has(key)) return
    result.push(draftItem)
    byKey.set(key, draftItem)
  })
  return result
}

export function applyDraftListToPlannerData({
  data,
  draft,
  mode = 'overwrite',
  getIncomingTargetsList,
  getTargetListKey,
  currentMetaByKey = new Map()
} = {}) {
  if (!data || typeof data !== 'object') return { applied: false }
  if (typeof getIncomingTargetsList !== 'function' || typeof getTargetListKey !== 'function') {
    return { applied: false }
  }
  const draftItems = parseDraftTargetsItems(draft)
  if (draftItems.length <= 1) return { applied: false }

  const incomingTargets = getIncomingTargetsList(data)
  const nextItems = mode === 'merge'
    ? mergeTargetListsPreferCurrent(incomingTargets, draftItems, getTargetListKey)
    : draftItems

  const nextQtyByKey = new Map()
  const nextSelectedKeys = new Set()
  const nextMetaByKey = new Map()

  nextItems.forEach((item) => {
    const key = getTargetListKey(item)
    nextQtyByKey.set(key, Math.max(0, Math.floor(Number(item?.qty) || 0)))
    if (item?.selected) nextSelectedKeys.add(key)
    const prev = currentMetaByKey?.get?.(key) || {}
    nextMetaByKey.set(key, {
      ...prev,
      ...(item?.dispatchStatus ? { dispatchStatus: item.dispatchStatus } : {})
    })
  })

  return {
    applied: true,
    dataTargets: nextItems.map((item) => ({
      id: Number.isFinite(Number(item?.id)) ? Number(item.id) : null,
      x: Number(item?.x),
      y: Number(item?.y)
    })),
    qtyByKey: nextQtyByKey,
    selectedKeys: nextSelectedKeys,
    metaByKey: nextMetaByKey,
    activeTargetKey: String(draft?.activeTargetKey || '').trim() || null
  }
}

export function buildTargetsDraftConflictState({
  data = null,
  draft = null,
  getIncomingTargetsList,
  getTargetListKey
} = {}) {
  if (typeof getIncomingTargetsList !== 'function' || typeof getTargetListKey !== 'function') {
    return { kind: 'none', draft: null }
  }
  const incomingTargets = getIncomingTargetsList(data)
  const incomingHasList = incomingTargets.length > 1
  const draftItems = parseDraftTargetsItems(draft)
  const draftHasList = draftItems.length > 1
  if (!draftHasList) return { kind: 'none', draft: null }

  const incomingSignature = incomingHasList ? getTargetsListCoordsSignature(incomingTargets, getTargetListKey) : ''
  const draftSignature = getTargetsListCoordsSignature(draftItems, getTargetListKey)

  if (!incomingHasList) return { kind: 'recover', draft, incomingTargets, draftItems }
  if (incomingSignature === draftSignature) return { kind: 'same', draft, incomingTargets, draftItems }
  return { kind: 'conflict', draft, incomingTargets, draftItems }
}

export function formatTargetsDraftChipLabel(state = null, readDraft = null) {
  const draft = state?.draft || (typeof readDraft === 'function' ? readDraft() : null)
  const totalTargets = Math.max(0, Math.floor(Number(draft?.meta?.totalTargets || (Array.isArray(draft?.targets) ? draft.targets.length : 0)) || 0))
  const pending = Math.max(0, Math.floor(Number(draft?.meta?.pendingRecoveryCount) || 0))
  if (totalTargets <= 1) return 'Rascunho'
  return pending > 0 ? `Rascunho ${totalTargets} • Pend ${pending}` : `Rascunho ${totalTargets}`
}

export function createTargetsDraftCore({
  ttlMs = 7 * 24 * 60 * 60 * 1000,
  storageKey = 'planner-targets-draft'
} = {}) {
  const storage = createDraftStorage({ ttlMs, storageKey })
  let stateCache = normalizeDraftStoreState(null)
  let hydrated = false
  let hydratePromise = null
  let persistPromise = Promise.resolve()
  const pendingMutations = []

  const cloneState = (state = stateCache) => normalizeDraftStoreState(cloneDraftStoreValue(state))

  const normalizeWritableState = (state = {}) => normalizeDraftStoreState({
    version: 2,
    lastDraft: state?.lastDraft || null,
    savedDrafts: Array.isArray(state?.savedDrafts) ? state.savedDrafts : []
  })

  const schedulePersist = (state = {}) => {
    const snapshot = normalizeWritableState(state)
    persistPromise = persistPromise
      .catch(() => null)
      .then(async() => {
        if (!snapshot.lastDraft && !snapshot.savedDrafts.length) {
          await storage.remove()
          return
        }
        await storage.write(snapshot)
      })
      .catch((error) => {
        console.warn('[planner:draft:storage:persist]', error?.message || error)
      })
    return snapshot
  }

  const applyMutation = (mutator) => {
    const nextState = normalizeWritableState(mutator(cloneState()) || stateCache)
    if (!hydrated) {
      pendingMutations.push(mutator)
    } else {
      schedulePersist(nextState)
    }
    stateCache = nextState
    return cloneState()
  }

  const ready = async() => {
    if (hydrated) return cloneState()
    if (!hydratePromise) {
      hydratePromise = (async() => {
        let nextState = normalizeDraftStoreState(await storage.ready())
        if (pendingMutations.length) {
          pendingMutations.splice(0).forEach((mutator) => {
            nextState = normalizeWritableState(mutator(cloneState(nextState)) || nextState)
          })
          schedulePersist(nextState)
        }
        stateCache = nextState
        hydrated = true
        return cloneState()
      })()
        .catch((error) => {
          console.warn('[planner:draft:core:ready]', error?.message || error)
          hydrated = true
          return cloneState()
        })
        .finally(() => {
          hydratePromise = null
        })
    }
    return await hydratePromise
  }

  const readState = () => cloneState()
  const writeState = (state = {}) => {
    const nextState = normalizeWritableState(state)
    if (!hydrated) {
      pendingMutations.push(() => nextState)
    } else {
      schedulePersist(nextState)
    }
    stateCache = nextState
    return cloneState()
  }
  const readDraft = () => readState().lastDraft || null
  const readNamedDraft = (draftId = '') => {
    const id = String(draftId || '').trim()
    if (!id) return null
    return readState().savedDrafts.find((entry) => String(entry?.draftId || '') === id) || null
  }
  const listNamedDrafts = () => readState().savedDrafts || []
  const removeDraft = ({ draftId = null } = {}) => {
    const id = String(draftId || '').trim()
    return applyMutation((state) => {
      if (!id) {
        state.lastDraft = null
        return state
      }
      state.savedDrafts = state.savedDrafts.filter((entry) => String(entry?.draftId || '') !== id)
      return state
    })
  }
  const writeDraft = (draft, { draftId = null } = {}) => {
    const id = String(draftId || '').trim()
    if (!draft || typeof draft !== 'object') {
      return removeDraft(id ? { draftId: id } : {})
    }
    let resultDraft = null
    const nextState = applyMutation((state) => {
      if (!id) {
        const nextLast = sanitizeDraftPayloadForStorage(draft, {
          preserveCreatedAt: state?.lastDraft?.createdAt ?? null
        })
        if (!nextLast) {
          resultDraft = state.lastDraft || null
          return state
        }
        {
          const now = Date.now()
          nextLast.createdAt = Number.isFinite(Number(nextLast?.createdAt)) ? Number(nextLast.createdAt) : now
          nextLast.updatedAt = now
        }
        state.lastDraft = nextLast
        resultDraft = cloneDraftStoreValue(nextLast)
        return state
      }
      const idx = state.savedDrafts.findIndex((entry) => String(entry?.draftId || '') === id)
      if (idx < 0) {
        const nextLast = sanitizeDraftPayloadForStorage(draft, {
          preserveCreatedAt: state?.lastDraft?.createdAt ?? null
        })
        if (!nextLast) {
          resultDraft = state.lastDraft || null
          return state
        }
        {
          const now = Date.now()
          nextLast.createdAt = Number.isFinite(Number(nextLast?.createdAt)) ? Number(nextLast.createdAt) : now
          nextLast.updatedAt = now
        }
        state.lastDraft = nextLast
        resultDraft = cloneDraftStoreValue(nextLast)
        return state
      }
      const current = state.savedDrafts[idx]
      const next = sanitizeDraftPayloadForStorage(draft, {
        draftId: id,
        name: current?.name || 'Draft',
        preserveCreatedAt: current?.createdAt ?? null
      })
      if (!next) {
        resultDraft = current || null
        return state
      }
      {
        const now = Date.now()
        next.createdAt = Number.isFinite(Number(next?.createdAt)) ? Number(next.createdAt) : now
        next.updatedAt = now
      }
      state.savedDrafts[idx] = next
      resultDraft = cloneDraftStoreValue(next)
      return state
    })
    if (!id) return resultDraft || nextState.lastDraft || null
    return resultDraft || readNamedDraft(id)
  }
  const saveNamedDraft = ({
    name = '',
    draft = null,
    draftId = null,
    source = 'last'
  } = {}) => {
    const safeName = sanitizeDraftName(name)
    if (!safeName) return { ok: false, error: 'Nome inválido.' }
    let resultDraft = null
    const nextState = applyMutation((state) => {
      const sourceDraft = (draft && typeof draft === 'object')
        ? draft
        : (String(source || '').trim() === 'last' ? state.lastDraft : null)
      if (!sourceDraft) return state

      const targetId = String(draftId || '').trim() || createNamedDraftId()
      const existingIndex = state.savedDrafts.findIndex((entry) => String(entry?.draftId || '') === targetId)
      const existing = existingIndex >= 0 ? state.savedDrafts[existingIndex] : null
      const payload = sanitizeDraftPayloadForStorage(sourceDraft, {
        draftId: targetId,
        name: safeName,
        preserveCreatedAt: existing?.createdAt ?? null
      })
      if (!payload) return state
      {
        const now = Date.now()
        payload.createdAt = Number.isFinite(Number(payload?.createdAt)) ? Number(payload.createdAt) : now
        payload.updatedAt = now
      }

      if (existingIndex >= 0) state.savedDrafts[existingIndex] = payload
      else state.savedDrafts.unshift(payload)

      if (String(source || '').trim() === 'last') {
        state.lastDraft = null
      }

      resultDraft = cloneDraftStoreValue(payload)
      return state
    })
    if (!resultDraft) {
      const sourceDraft = (draft && typeof draft === 'object')
        ? draft
        : (String(source || '').trim() === 'last' ? readState().lastDraft : null)
      return sourceDraft
        ? { ok: false, error: 'Draft inválido para salvar.' }
        : { ok: false, error: 'Nenhum draft válido para salvar.' }
    }
    return { ok: true, draft: resultDraft, state: nextState }
  }
  const promoteLastDraftToNamed = (name = '') => saveNamedDraft({ name, source: 'last' })
  void ready()
  return {
    storage,
    ready,
    readState,
    writeState,
    readDraft,
    writeDraft,
    removeDraft,
    readNamedDraft,
    listNamedDrafts,
    saveNamedDraft,
    promoteLastDraftToNamed,
    removeNamedDraft: (draftId) => removeDraft({ draftId }),
    resetStorageCache: () => {
      storage.resetCache()
      stateCache = normalizeDraftStoreState(null)
      hydrated = false
      pendingMutations.splice(0)
      hydratePromise = null
    },
    sanitizeDraftDispatchStatus,
    sanitizeDraftName,
    createNamedDraftId,
    getTargetsListCoordsSignature,
    serializeTargetsDraft,
    parseDraftTargetsItems,
    mergeTargetListsPreferCurrent,
    applyDraftListToPlannerData,
    buildTargetsDraftConflictState,
    formatTargetsDraftChipLabel
  }
}
