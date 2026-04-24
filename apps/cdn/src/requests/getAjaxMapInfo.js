import { combineAbortControllerSignals, makeAjaxHeadersGet } from '@toolkit-tw-bot/browser';
import { getGameData, ProtectingBot } from '@toolkit-tw-bot/document';

const MAP_INFO_CACHE_KEY = '__GO_PLANNER_MAP_INFO_CACHE__'

function getMapInfoCacheState() {
  const state = window[MAP_INFO_CACHE_KEY] || {}
  if (!(state.cache instanceof Map)) state.cache = new Map()
  if (!(state.inFlight instanceof Map)) state.inFlight = new Map()
  window[MAP_INFO_CACHE_KEY] = state
  return state
}

function buildMapInfoCacheKey({ targetId = null } = {}) {
  const target = Number(targetId)
  return Number.isFinite(target) && target > 0 ? String(Math.trunc(target)) : ''
}

function normalizeTargetId(targetId) {
  const value = Number(targetId)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.trunc(value)
}

function isMapInfoPayload(value) {
  if (!value || typeof value !== 'object') return false
  const id = Number(value?.id)
  if (!Number.isFinite(id) || id <= 0) return false
  if (Number.isFinite(Number(value?.morale))) return true
  if (value?.night_bonus && typeof value.night_bonus === 'object') return true
  if (value?.units && typeof value.units === 'object') return true
  return false
}

function unwrapMapInfoCandidate(value) {
  if (!value || typeof value !== 'object') return null
  if (isMapInfoPayload(value)) return value
  if (isMapInfoPayload(value?.response)) return value.response
  return null
}

function tryGetMapInfoFromTwMapContext(targetId) {
  const gameData = getGameData()
  if (String(gameData?.screen || '').trim().toLowerCase() !== 'map') return null
  const twContext = window?.TWMap?.context
  if (!twContext || typeof twContext !== 'object') return null
  const normalizedTargetId = Number(targetId)
  if (!Number.isFinite(normalizedTargetId) || normalizedTargetId <= 0) return null

  const candidates = [
    twContext?.data,
    twContext?._data,
    twContext?.popupData,
    twContext?.popup_data,
    twContext?._popupData,
    twContext?._popup_data,
    twContext?.villageData,
    twContext?.village_data,
    twContext?._villageData,
    twContext?._village_data,
    twContext?.currentVillageData,
    twContext?._currentVillageData,
    twContext?.villageInfo,
    twContext?.village_info
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const payload = unwrapMapInfoCandidate(item)
        if (!payload) continue
        if (Number(payload.id) === normalizedTargetId) return payload
      }
      continue
    }
    const payload = unwrapMapInfoCandidate(candidate)
    if (!payload) continue
    if (Number(payload.id) === normalizedTargetId) return payload
  }

  return null
}

function getMapInfoFromWindowCache(targetId) {
  const normalizedTargetId = normalizeTargetId(targetId)
  if (!normalizedTargetId) return null
  const cacheState = getMapInfoCacheState()
  const cacheKey = buildMapInfoCacheKey({ targetId: normalizedTargetId })
  if (cacheState.cache.has(cacheKey)) {
    return cacheState.cache.get(cacheKey)
  }
  const fromTwMapContext = tryGetMapInfoFromTwMapContext(normalizedTargetId)
  if (fromTwMapContext) {
    cacheState.cache.set(cacheKey, fromTwMapContext)
    return fromTwMapContext
  }
  return null
}

export function getCachedAjaxMapInfo(targetId) {
  return getMapInfoFromWindowCache(targetId)
}

export async function getAjaxMapInfo(targetId, { signal, requestIfMissing = true } = {}) {
  const gameData = getGameData();
  const normalizedTargetId = normalizeTargetId(targetId)
  if (!normalizedTargetId) {
    throw new Error('Target inválido para map_info')
  }
  const cacheState = getMapInfoCacheState()
  const cacheKey = buildMapInfoCacheKey({ targetId: normalizedTargetId })
  const cachedResponse = getMapInfoFromWindowCache(normalizedTargetId)
  if (cachedResponse) return cachedResponse
  if (!requestIfMissing) return null
  if (cacheState.inFlight.has(cacheKey)) {
    return cacheState.inFlight.get(cacheKey)
  }
  const url = new URL(
    `${gameData.link_base_pure}map&ajax=map_info&source=${gameData.village.id}&target=${normalizedTargetId}`,
    window.origin
  );

  const headers = makeAjaxHeadersGet();

  // controller só pro timeout
  const timeoutCtrl = new AbortController();
  const t = setTimeout(() => timeoutCtrl.abort(new Error("timeout")), 8000);

  // ✅ combina: abort externo + timeout
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal;

  if (ProtectingBot["bot-protect-all-in-game"].active()) {
    clearTimeout(t);
    throw ProtectingBot.error();
  }

  const requestPromise = (async () => {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal,
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const { response, error } = await res.json();
    if (error || !response) throw new Error(error || "Not found!");
    cacheState.cache.set(cacheKey, response)
    return response;
  })()

  cacheState.inFlight.set(cacheKey, requestPromise)

  try {
    return await requestPromise
  } finally {
    clearTimeout(t);
    cacheState.inFlight.delete(cacheKey)
  }
}
