// eslint-disable-next-line eslint-comments/disable-enable-pair
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  isActiveTabAttributeEnabled,
  watchActiveTabAttribute,
} from '../../../../shared/watchActiveTabAttribute'

const IDLE_MESSAGE_TYPE = 'CHANGE_GLOBAL_TRIBAL_WARS'
const DIAGNOSTIC_MESSAGE_TYPE = 'CHANGE_GLOBAL_TRIBAL_WARS_DIAGNOSTIC'
const IDLE_POLL_INTERVAL_MS = 1000
const ACTIVE_TAB_HEARTBEAT_INTERVAL_MS = 1000
const BOOTSTRAP_KEY = '__toolkitTwBotChangeGlobalTribalWarsInstalled__'
const IDLE_INTERVAL_KEY = '__toolkitTwBotChangeGlobalTribalWarsInterval__'
const ACTIVE_TAB_INTERVAL_KEY = '__toolkitTwBotChangeGlobalTribalWarsActiveTabInterval__'
const ACTIVITY_STATE_KEY = '__toolkitTwBotChangeGlobalTribalWarsActivityState__'
const ACTIVE_TAB_ID_KEY = '__toolkitTwBotChangeGlobalTribalWarsActiveTabId__'
const ACTIVE_TAB_STORAGE_KEY = 'activetab'

export type ITribalWars = {
  isGo?: boolean
  fetch: (args: any) => object
  get: (args: any) => object
  post: (args: any) => object
  request: (args: any) => object
  redirect: (args: any) => object
  buildURL: (args: any) => object
  updateGameData: (args: any) => object
  mergeGameDataProperty: (args: any) => object
  handleGameData: (args: any) => object
  handleResponse: (args: any) => object
  registerOnLoadHandler: (args: any) => object
  shouldPartialLoad: (args: any) => object
  showResourceIncrease: (args: any) => object
  playSound: (args: any) => object
  setSetting: (args: any) => object
  suppressHint: (args: any) => object
  getSetting: (args: any) => object
  isTabActive: (...args: any[]) => unknown
  isAnyTabActive: (...args: any[]) => unknown
  wasLastActiveTab: (...args: any[]) => unknown
  getIdleTime: (...args: any[]) => number
  track: (args: any) => object
  a429124ce67: (args: any) => object
  jQuery351049531088168783511: {
    handle: (args: any) => object
  }
}

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
  [IDLE_INTERVAL_KEY]?: number
  [ACTIVE_TAB_INTERVAL_KEY]?: number
  [ACTIVITY_STATE_KEY]?: Record<string, unknown>
  [ACTIVE_TAB_ID_KEY]?: string
}

function describeTwValue(value: unknown, depth = 0): unknown {
  if (
    value === null
    || value === undefined
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`
  }

  if (value === window) {
    return '[window]'
  }

  if (value === document) {
    return '[document]'
  }

  if (value instanceof Element) {
    return `[Element ${value.tagName.toLowerCase()}]`
  }

  if (Array.isArray(value)) {
    if (depth >= 1) {
      return `[Array(${value.length})]`
    }

    return value.slice(0, 5).map((item) => describeTwValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    const constructorName = (value as { constructor?: { name?: string } }).constructor?.name

    if (constructorName && constructorName !== 'Object') {
      return `[${constructorName}]`
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(0, 5)

    return Object.fromEntries(
      entries.map(([key, item]) => [key, describeTwValue(item, depth + 1)]),
    )
  }

  return String(value)
}

function recordTwCall(
  scope: ToolkitWindow,
  name: string,
  args: unknown[],
  result: unknown,
) {
  scope[ACTIVITY_STATE_KEY] = {
    ...(scope[ACTIVITY_STATE_KEY] as Record<string, unknown> | undefined),
    [name]: {
      at: Date.now(),
      args: args.map((value) => describeTwValue(value)),
      result: describeTwValue(result),
    },
  }
}

function getTwActivitySnapshot(scope: ToolkitWindow) {
  return scope[ACTIVITY_STATE_KEY] || {}
}

function readStorageValue(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function isRunningTabEnabled() {
  return isActiveTabAttributeEnabled()
}

function parseStoredLease(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value)

    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') {
      return null
    }

    const timestamp = Number(parsed[1])

    return {
      id: parsed[0],
      timestamp: Number.isFinite(timestamp) ? timestamp : null,
    }
  } catch {
    return null
  }
}

function getOrCreateActiveTabId(scope: ToolkitWindow) {
  if (scope[ACTIVE_TAB_ID_KEY]) {
    return scope[ACTIVE_TAB_ID_KEY] as string
  }

  const currentLease = parseStoredLease(readStorageValue(ACTIVE_TAB_STORAGE_KEY))

  scope[ACTIVE_TAB_ID_KEY] = currentLease?.id
    || Math.random().toString(16).slice(2)

  return scope[ACTIVE_TAB_ID_KEY] as string
}

function buildActiveTabLeaseRaw(scope: ToolkitWindow) {
  return JSON.stringify([getOrCreateActiveTabId(scope), Date.now()])
}

function parseStoredBoolean(value: string | null) {
  if (value === null) {
    return null
  }

  try {
    const parsed = JSON.parse(value)

    return typeof parsed === 'boolean' ? parsed : null
  } catch {
    return null
  }
}

function emitDiagnostic(
  scope: ToolkitWindow,
  event: string,
  details?: Record<string, unknown>,
) {
  if (
    !isRunningTabEnabled()
    && event !== 'runner.active-tab.change'
  ) {
    return
  }

  const storageActiveTabRaw = readStorageValue('activetab')

  window.postMessage({
    type: DIAGNOSTIC_MESSAGE_TYPE,
    event,
    at: Date.now(),
    storageActiveTabRaw,
    storageActiveTabParsed: parseStoredBoolean(storageActiveTabRaw),
    documentHasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    twActivitySnapshot: getTwActivitySnapshot(scope),
    details,
  }, window.location.origin)
}

function syncVirtualActiveTabLease(
  scope: ToolkitWindow,
  originalStorageSetItem: typeof Storage.prototype.setItem,
  reason: string,
) {
  if (!isRunningTabEnabled()) {
    return
  }

  const previousValue = readStorageValue(ACTIVE_TAB_STORAGE_KEY)
  const nextValue = buildActiveTabLeaseRaw(scope)

  originalStorageSetItem.call(window.localStorage, ACTIVE_TAB_STORAGE_KEY, nextValue)

  emitDiagnostic(scope, 'virtual-active-tab.sync', {
    reason,
    previousValue,
    nextValue,
  })
}

function getEffectiveIdleTime(
  rawIdleTime: number,
) {
  return isRunningTabEnabled()
    ? 0
    : rawIdleTime
}

function startIdleInterval(
  scope: ToolkitWindow,
  emitIdleTime: (...args: any[]) => number,
) {
  if (scope[IDLE_INTERVAL_KEY]) {
    return
  }

  scope[IDLE_INTERVAL_KEY] = window.setInterval(() => {
    emitIdleTime()
  }, IDLE_POLL_INTERVAL_MS)
}

function stopIdleInterval(scope: ToolkitWindow) {
  if (!scope[IDLE_INTERVAL_KEY]) {
    return
  }

  window.clearInterval(scope[IDLE_INTERVAL_KEY])
  delete scope[IDLE_INTERVAL_KEY]
}

function startActiveTabHeartbeatInterval(
  scope: ToolkitWindow,
  originalStorageSetItem: typeof Storage.prototype.setItem,
) {
  if (scope[ACTIVE_TAB_INTERVAL_KEY]) {
    return
  }

  scope[ACTIVE_TAB_INTERVAL_KEY] = window.setInterval(() => {
    syncVirtualActiveTabLease(scope, originalStorageSetItem, 'heartbeat')
  }, ACTIVE_TAB_HEARTBEAT_INTERVAL_MS)
}

function stopActiveTabHeartbeatInterval(scope: ToolkitWindow) {
  if (!scope[ACTIVE_TAB_INTERVAL_KEY]) {
    return
  }

  window.clearInterval(scope[ACTIVE_TAB_INTERVAL_KEY])
  delete scope[ACTIVE_TAB_INTERVAL_KEY]
}

export default () => {
  if ('TribalWars' in window) {
    const scope = window as ToolkitWindow

    if (
      scope[BOOTSTRAP_KEY]
      || typeof (window.TribalWars as ITribalWars).isGo !== 'undefined'
    ) {
      return
    }

    const old = window.TribalWars as ITribalWars
    const originalGetIdleTime = old.getIdleTime?.bind(old)
    const originalIsTabActive = old.isTabActive?.bind(old)
    const originalIsAnyTabActive = old.isAnyTabActive?.bind(old)
    const originalWasLastActiveTab = old.wasLastActiveTab?.bind(old)
    const originalStorageSetItem = Storage.prototype.setItem
    const originalStorageRemoveItem = Storage.prototype.removeItem

    const emitIdleTime = (...args: any[]) => {
      if (typeof originalGetIdleTime !== 'function') {
        return 0
      }

      const rawIdleTime = originalGetIdleTime(...args) as number
      const effectiveIdleTime = getEffectiveIdleTime(rawIdleTime)
      const isRunningTab = isRunningTabEnabled()

      if (isRunningTab) {
        recordTwCall(scope, 'getIdleTime', args, {
          rawIdleTime,
          effectiveIdleTime,
          forced: effectiveIdleTime !== rawIdleTime,
        })

        window.postMessage({
          type: IDLE_MESSAGE_TYPE,
          idleTime: rawIdleTime,
          rawIdleTime,
          effectiveIdleTime,
          idleTimeForced: effectiveIdleTime !== rawIdleTime,
          twActivitySnapshot: getTwActivitySnapshot(scope),
        }, window.location.origin)
      }

      return effectiveIdleTime
    }

    scope[BOOTSTRAP_KEY] = true
    scope[ACTIVITY_STATE_KEY] = {}

    Object.defineProperty(window.TribalWars, 'getIdleTime', {
      enumerable: true,
      writable: true,
      configurable: true,
    })

    window.TribalWars = {
      ...old,

      isGo: true,

      getIdleTime: function (...args: any[]) {
        return emitIdleTime(...args)
      },

      isTabActive: function (...args: any[]) {
        const originalResult = originalIsTabActive?.(...args)
        const effectiveResult = isRunningTabEnabled() ? true : originalResult
        recordTwCall(scope, 'isTabActive', args, {
          originalResult,
          effectiveResult,
          forced: effectiveResult !== originalResult,
        })
        return effectiveResult
      },

      isAnyTabActive: function (...args: any[]) {
        const originalResult = originalIsAnyTabActive?.(...args)
        const effectiveResult = isRunningTabEnabled() ? true : originalResult
        recordTwCall(scope, 'isAnyTabActive', args, {
          originalResult,
          effectiveResult,
          forced: effectiveResult !== originalResult,
        })
        return effectiveResult
      },

      wasLastActiveTab: function (...args: any[]) {
        const originalResult = originalWasLastActiveTab?.(...args)
        const effectiveResult = isRunningTabEnabled() ? true : originalResult
        recordTwCall(scope, 'wasLastActiveTab', args, {
          originalResult,
          effectiveResult,
          forced: effectiveResult !== originalResult,
        })
        return effectiveResult
      },
    }

    Storage.prototype.setItem = function (key: string, value: string) {
      const previousValue = this === window.localStorage
        ? readStorageValue(key)
        : null

      const nextValue = (
        this === window.localStorage
        && key === ACTIVE_TAB_STORAGE_KEY
        && isRunningTabEnabled()
      )
        ? buildActiveTabLeaseRaw(scope)
        : value

      const result = originalStorageSetItem.call(this, key, nextValue)

      if (this === window.localStorage && key === 'activetab') {
        emitDiagnostic(scope, 'localStorage.setItem', {
          key,
          previousValue,
          requestedValue: value,
          nextValue,
          intercepted: nextValue !== value,
        })
      }

      return result
    }

    Storage.prototype.removeItem = function (key: string) {
      const previousValue = this === window.localStorage
        ? readStorageValue(key)
        : null

      const result = originalStorageRemoveItem.call(this, key)

      if (this === window.localStorage && key === ACTIVE_TAB_STORAGE_KEY) {
        if (isRunningTabEnabled()) {
          syncVirtualActiveTabLease(scope, originalStorageSetItem, 'removeItem-intercept')
        } else {
          emitDiagnostic(scope, 'localStorage.removeItem', {
            key,
            previousValue,
          })
        }
      }

      return result
    }

    window.addEventListener('focus', () => {
      emitDiagnostic(scope, 'window.focus')
    }, true)

    window.addEventListener('blur', () => {
      emitDiagnostic(scope, 'window.blur')
    }, true)

    document.addEventListener('visibilitychange', () => {
      emitDiagnostic(scope, 'document.visibilitychange')
    }, true)

    emitDiagnostic(scope, 'bootstrap')

    watchActiveTabAttribute((isActive, previousIsActive) => {
      if (isActive) {
        emitDiagnostic(scope, 'runner.active-tab.change', {
          isActive,
          previousIsActive,
        })
      }

      if (!isActive) {
        stopIdleInterval(scope)
        stopActiveTabHeartbeatInterval(scope)
        return
      }

      syncVirtualActiveTabLease(
        scope,
        originalStorageSetItem,
        previousIsActive === null ? 'attribute-bootstrap' : 'attribute-enabled',
      )
      emitIdleTime()
      startIdleInterval(scope, emitIdleTime)
      startActiveTabHeartbeatInterval(scope, originalStorageSetItem)
    })
  }
  console.log('[GlobalChange] patch installed')
}
