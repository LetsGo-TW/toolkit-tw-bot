import { getGameData } from "@toolkit-tw-bot/document"
import { consoleDev } from "@toolkit-tw-bot/utils"

const MAP_INFO_CACHE_KEY = '__GO_PLANNER_MAP_INFO_CACHE__'
const MAP_INFO_OBSERVER_INSTALLED_KEY = '__GO_PLANNER_MAP_INFO_OBSERVER_INSTALLED__'

function normalizePositiveInt(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

function buildMapInfoCacheKey({ targetId = null } = {}) {
  const target = normalizePositiveInt(targetId)
  return target !== null ? String(target) : ''
}

function getMapInfoCacheState() {
  const state = window[MAP_INFO_CACHE_KEY] || {}
  if (!(state.cache instanceof Map)) state.cache = new Map()
  if (!(state.inFlight instanceof Map)) state.inFlight = new Map()
  window[MAP_INFO_CACHE_KEY] = state
  return state
}

function parseUrl(urlLike) {
  if (!urlLike) return null
  try {
    return new URL(String(urlLike), window.origin)
  } catch (_) {
    return null
  }
}

function isMapInfoUrl(urlObj) {
  if (!urlObj) return false
  const ajax = String(urlObj.searchParams.get('ajax') || '').trim().toLowerCase()
  if (ajax !== 'map_info') return false
  const screen = String(urlObj.searchParams.get('screen') || '').trim().toLowerCase()
  if (screen && screen !== 'map') return false
  return true
}

function unwrapMapInfoPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  const response = (payload.response && typeof payload.response === 'object')
    ? payload.response
    : payload
  const id = normalizePositiveInt(response?.id)
  if (!id) return null
  return response
}

function debugCapturedMapInfo({
  captureSource = '',
  targetId = null,
  response = null,
  urlObj = null
} = {}) {
  if (captureSource !== 'xhr') return
  consoleDev({
    capture: captureSource,
    targetId,
    villageId: normalizePositiveInt(response?.id),
    morale: Number.isFinite(Number(response?.morale)) ? Number(response.morale) : null,
    hasNightBonus: Boolean(response?.night_bonus),
    hasReservation: Boolean(response?.reservation),
    url: urlObj ? `${urlObj.pathname}${urlObj.search}` : null
  }, {
    label: '[MAP][XHR][map_info]',
    color: '#22a06b'
  })
}

function saveMapInfoInWindowCache(urlLike, payload, { captureSource = 'unknown' } = {}) {
  const urlObj = parseUrl(urlLike)
  if (!isMapInfoUrl(urlObj)) return

  const response = unwrapMapInfoPayload(payload)
  if (!response) return

  const targetFromQuery = normalizePositiveInt(urlObj.searchParams.get('target'))
  const responseVillageId = normalizePositiveInt(response.id)
  const targetId = targetFromQuery || responseVillageId
  if (!targetId) return

  const cacheState = getMapInfoCacheState()
  cacheState.cache.set(buildMapInfoCacheKey({ targetId }), response)
  if (responseVillageId && responseVillageId !== targetId) {
    cacheState.cache.set(buildMapInfoCacheKey({ targetId: responseVillageId }), response)
  }

  debugCapturedMapInfo({
    captureSource,
    targetId,
    response,
    urlObj
  })
}

function parseFetchUrl(input) {
  if (typeof input === 'string') return input
  if (input && typeof input.url === 'string') return input.url
  return null
}

function parseXhrJsonPayload(xhr) {
  if (!xhr) return null
  if (xhr.responseType === 'json' && xhr.response && typeof xhr.response === 'object') {
    return xhr.response
  }
  if (xhr.responseType && xhr.responseType !== '' && xhr.responseType !== 'text') {
    return null
  }
  const raw = typeof xhr.responseText === 'string' ? xhr.responseText.trim() : ''
  if (!raw || (raw[0] !== '{' && raw[0] !== '[')) return null
  try {
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function patchFetchForMapInfoCache() {
  if (typeof window.fetch !== 'function') return
  if (window.fetch.__goMapInfoCacheObserverPatched__) return

  const originalFetch = window.fetch
  const wrappedFetch = async function patchedFetch(...args) {
    const requestUrl = parseFetchUrl(args[0])
    const response = await originalFetch.apply(this, args)

    try {
      const urlObj = parseUrl(requestUrl || response?.url)
      if (response?.ok && isMapInfoUrl(urlObj)) {
        response.clone().json()
          .then((payload) => saveMapInfoInWindowCache(urlObj.toString(), payload, { captureSource: 'fetch' }))
          .catch(() => {})
      }
    } catch (_) {}

    return response
  }

  wrappedFetch.__goMapInfoCacheObserverPatched__ = true
  window.fetch = wrappedFetch
}

function patchXhrForMapInfoCache() {
  if (!window.XMLHttpRequest || !window.XMLHttpRequest.prototype) return

  const proto = window.XMLHttpRequest.prototype
  if (proto.open.__goMapInfoCacheObserverPatched__) return

  const originalOpen = proto.open
  const originalSend = proto.send

  proto.open = function patchedOpen(method, url, ...rest) {
    this.__goMapInfoRequestUrl = typeof url === 'string' ? url : null
    const urlObj = parseUrl(this.__goMapInfoRequestUrl)
    this.__goMapInfoIsTargetRequest = isMapInfoUrl(urlObj)
    return originalOpen.call(this, method, url, ...rest)
  }

  proto.send = function patchedSend(...args) {
    if (this.__goMapInfoIsTargetRequest && !this.__goMapInfoCacheBound) {
      this.__goMapInfoCacheBound = true
      this.addEventListener('loadend', () => {
        try {
          if (!this.status || this.status < 200 || this.status >= 300) return
          const payload = parseXhrJsonPayload(this)
          if (!payload) return
          const finalUrl = this.responseURL || this.__goMapInfoRequestUrl
          saveMapInfoInWindowCache(finalUrl, payload, { captureSource: 'xhr' })
        } catch (_) {}
      }, { once: true })
    }
    return originalSend.apply(this, args)
  }

  proto.open.__goMapInfoCacheObserverPatched__ = true
}

export function initMapInfoCacheObserver() {
  if (window[MAP_INFO_OBSERVER_INSTALLED_KEY]) return

  const gameData = getGameData()
  const screen = String(gameData?.screen || '').trim().toLowerCase()
  if (screen !== 'map') return

  window[MAP_INFO_OBSERVER_INSTALLED_KEY] = true

  getMapInfoCacheState()
  patchFetchForMapInfoCache()
  patchXhrForMapInfoCache()
}
