const {
  combineAbortControllerSignals,
  makeAjaxHeadersGet,
  StorageLocalCompat,
} = require('@toolkit-tw-bot/browser')
const getGameData = require('./get-game-data')
const ProtectingBot = require('./protecting-bot')
const {
  assertNoCaptchaInGame,
  assertNoGameUpdateOrBlockedRequest,
} = require('./tw-runtime-guards')
const unitsSpeed = require('./unit-speed')
const BOT_PROTECT_MESSAGE = 'Identified bot protection'
const botProtectInGame = ProtectingBot['bot-protect-all-in-game']

let cachedUnitData = null
let cachedUnitDataScopeKey = null
let storageUnitInfo = null
let storageUnitInfoScopeKey = null
let inFlight = null

function isBotProtectError(error = null) {
  return error?.message === BOT_PROTECT_MESSAGE
}

function looksLikeHtmlResponse(text = '') {
  const normalized = String(text || '').toLowerCase().trim()

  if (!normalized) return false

  return normalized.includes('<html')
    || normalized.includes('<!doctype')
    || normalized.includes('id="ds_body"')
    || normalized.includes("id='ds_body'")
    || normalized.includes('bot_check')
    || normalized.includes('botprotection_quest')
    || normalized.includes('popup_box_bot_protection')
    || normalized.includes('id="error"')
    || normalized.includes("id='error'")
}

function getCurrentGameData() {
  if (typeof window !== 'undefined' && window?.game_data) {
    return window.game_data
  }

  if (typeof document === 'undefined') return null

  try {
    return getGameData()
  } catch (_) {
    return null
  }
}

function getUnitInfoScope() {
  const gameData = getCurrentGameData()
  const world = String(gameData?.world || '').trim()

  if (!world) {
    return null
  }

  return {
    compose: {
      world,
      path: ['unit', 'info'],
    },
    scopeKey: `world:${world}`,
  }
}

function getUnitInfoStorage() {
  const scope = getUnitInfoScope()
  const scopeKey = scope?.scopeKey || null

  if (!scopeKey) {
    return { scopeKey: null, storage: null }
  }

  if (storageUnitInfo && storageUnitInfoScopeKey === scopeKey) {
    return { scopeKey, storage: storageUnitInfo }
  }

  storageUnitInfo = StorageLocalCompat.create(scope.compose)
  storageUnitInfoScopeKey = scopeKey

  return { scopeKey, storage: storageUnitInfo }
}

function syncCachedUnitData(data, scopeKey = null) {
  cachedUnitData = data && typeof data === 'object' ? data : null
  cachedUnitDataScopeKey = cachedUnitData ? (scopeKey || null) : null
  return cachedUnitData
}

async function readStoredUnitData(storage) {
  if (!storage?.get) return null

  try {
    const stored = await storage.get()
    return stored && typeof stored === 'object' ? stored : null
  } catch (error) {
    console.warn('[unit][storage:get]', error)
    return null
  }
}

async function writeStoredUnitData(storage, data) {
  if (!storage?.set || !data || typeof data !== 'object') return

  try {
    await storage.set(data)
  } catch (error) {
    console.warn('[unit][storage:set]', error)
  }
}

async function getAjaxUnitInfo({ signal } = {}) {
  const gameData = getCurrentGameData()
  const url = new URL(
    `${gameData.link_base_pure}unit_info&ajax=data`,
    window.origin,
  )

  const headers = makeAjaxHeadersGet()
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error('timeout')), 8000)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  if (botProtectInGame.active()) {
    clearTimeout(timeoutId)
    throw ProtectingBot.error()
  }

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers,
      credentials: 'include',
      referrerPolicy: 'origin',
      cache: 'no-store',
      signal: combinedSignal,
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()

    if (looksLikeHtmlResponse(text)) {
      const html = new DOMParser().parseFromString(text, 'text/html')
      assertNoCaptchaInGame(html, 'unit-runtime:ajax-response')
      assertNoGameUpdateOrBlockedRequest(html, { context: 'unit-runtime:ajax-response' })
    }

    const { response, error } = JSON.parse(text)

    if (error || !response) throw new Error(error || 'Not found!')
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

function getUnitData() {
  const { scopeKey } = getUnitInfoStorage()
  if (scopeKey && cachedUnitDataScopeKey && cachedUnitDataScopeKey !== scopeKey) {
    return null
  }
  return cachedUnitData
}

async function preloadUnitData() {
  const { scopeKey, storage } = getUnitInfoStorage()

  if (cachedUnitData && cachedUnitDataScopeKey === scopeKey) return cachedUnitData
  if (inFlight?.scopeKey === scopeKey) return inFlight.promise

  const promise = (async () => {
    try {
      const stored = await readStoredUnitData(storage)
      if (stored) {
        return syncCachedUnitData(stored, scopeKey)
      }

      const { unit_data: data } = await getAjaxUnitInfo()
      if (!data) throw new Error('Data units not found!')
      await writeStoredUnitData(storage, data)
      return syncCachedUnitData(data, scopeKey)
    } catch (error) {
      if (isBotProtectError(error) || botProtectInGame.active()) {
        throw error
      }

      console.error(error)
      return null
    } finally {
      if (inFlight?.promise === promise) {
        inFlight = null
      }
    }
  })()

  inFlight = {
    scopeKey,
    promise,
  }

  return promise
}

async function initUnitdata() {
  return preloadUnitData()
}

function travelSecond(distance, unit) {
  if (!cachedUnitData) throw new Error('Data units require init!')
  return (distance / cachedUnitData[unit].speed)
}

function incomingUnitSlow(arrivalSecond, distance) {
  if (!cachedUnitData) throw new Error('Data units require init!')
  const unitsIncoming = Object.entries(unitsSpeed.incoming)
    .sort((a, b) => {
      if (a[1] > b[1]) return -1
      if (a[1] < b[1]) return 1
      return 0
    })
    .map(([unit]) => unit)

  let slow = 'snob'

  for (const unit of unitsIncoming) {
    const travelTime = Math.round(distance / cachedUnitData[unit].speed)
    // Tolerância de 2s para compensar os milissegundos arredondados do timer visual ("Chega em 0:09:01")
    if (arrivalSecond > travelTime + 2) return slow
    slow = unit
  }

  return slow
}

module.exports = {
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
}
