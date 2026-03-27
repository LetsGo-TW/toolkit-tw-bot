/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { setActiveTitle } from './setActiveTitle'

const RUNNER_STORAGE_KEY = 'runnerByScope'
const TAB_CONTEXT_STORAGE_KEY = 'tabContextByTabId'
const WINDOW_LOCK_STORAGE_KEY = 'windowLock'
const CONNECT_MESSAGE_TYPE = 'CONNECT'
const PREPARED_MESSAGE_TYPE = 'PREPARED'
const START_MESSAGE_TYPE = 'BOT_RUNNER_START'
const STOP_MESSAGE_TYPE = 'BOT_RUNNER_STOP'

type PreparedContextType = 'GAME' | 'LOGIN'

export type RunnerRecord = {
  scopeKey: string
  world: string
  t: number | null
  windowId: number
  tabId: number
}

export type RunnerByScope = Record<string, RunnerRecord>

export type TabContextRecord = {
  tabId: number
  windowId: number
  url: string | null
  context: PreparedContextType | null
  world: string | null
  t: number | null
  isTryConfirm: boolean
  scopeKey: string | null
  playerId: number | null
  playerName: string | null
  updatedAt: string
}

type TabContextByTabId = Record<string, TabContextRecord>

type WindowLockRecord = {
  scopeKey: string
  world: string
  t: number | null
  windowId: number
}

type PreparedMessageData = {
  context?: unknown
  world?: unknown
  t?: unknown
  isTryConfirm?: unknown
  playerId?: unknown
  playerName?: unknown
}

type TabUpdatedChangeInfo = {
  url?: string
  status?: string
}

type TabActivatedActiveInfo = {
  tabId: number
  windowId: number
}

type TabAttachedAttachInfo = {
  newPosition: number
  newWindowId: number
}

type TabDetachedDetachInfo = {
  oldPosition: number
  oldWindowId: number
}

type TabRemovedRemoveInfo = {
  isWindowClosing: boolean
  windowId: number
}

let cacheLoaded = false
let runnerByScopeCache: RunnerByScope = {}
let tabContextByTabIdCache: TabContextByTabId = {}
let windowLockCache: WindowLockRecord | null = null
let pendingDetachedRunner: RunnerRecord | null = null

function getWorldFromUrl(urlString?: string | null) {
  if (!urlString) {
    return null
  }

  try {
    const url = new URL(urlString)
    const world = url.hostname.split('.')[0] || null

    return world === 'www' ? null : world
  } catch {
    return null
  }
}

function getScopeFromUrl(urlString?: string | null) {
  const world = getWorldFromUrl(urlString)

  if (!world || !urlString) {
    return null
  }

  const { isInGame, t } = getParamsUrl(urlString)

  if (!isInGame) {
    return null
  }

  return {
    world,
    t: t ?? null,
    scopeKey: `${world}:${t ?? 'main'}`,
  }
}

function normalizePreparedContextType(value: unknown): PreparedContextType | null {
  return value === 'GAME' || value === 'LOGIN' ? value : null
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeBoolean(value: unknown) {
  return value === true
}

function normalizeRunnerByScope(value: unknown): RunnerByScope {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as RunnerByScope
}

function normalizeTabContextByTabId(value: unknown): TabContextByTabId {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as TabContextByTabId
}

function normalizeWindowLock(value: unknown): WindowLockRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as WindowLockRecord
}

function isSameRunner(a: RunnerRecord | null, b: RunnerRecord | null) {
  if (!a && !b) {
    return true
  }

  if (!a || !b) {
    return false
  }

  return (
    a.scopeKey === b.scopeKey
    && a.windowId === b.windowId
    && a.tabId === b.tabId
  )
}

function getTabContextKey(tabId: number) {
  return String(tabId)
}

async function ensureCacheLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([
    RUNNER_STORAGE_KEY,
    TAB_CONTEXT_STORAGE_KEY,
    WINDOW_LOCK_STORAGE_KEY,
  ])

  runnerByScopeCache = normalizeRunnerByScope(stored[RUNNER_STORAGE_KEY])
  tabContextByTabIdCache = normalizeTabContextByTabId(stored[TAB_CONTEXT_STORAGE_KEY])
  windowLockCache = normalizeWindowLock(stored[WINDOW_LOCK_STORAGE_KEY])
  cacheLoaded = true
}

async function persistStateIfChanged(
  key: string,
  previousValue: unknown,
  nextValue: unknown,
) {
  if (JSON.stringify(previousValue) === JSON.stringify(nextValue)) {
    return
  }

  await chrome.storage.local.set({
    [key]: nextValue,
  })
}

async function persistRunnerByScope(previous: RunnerByScope, next: RunnerByScope) {
  await persistStateIfChanged(RUNNER_STORAGE_KEY, previous, next)
}

async function persistTabContextByTabId(
  previous: TabContextByTabId,
  next: TabContextByTabId,
) {
  await persistStateIfChanged(TAB_CONTEXT_STORAGE_KEY, previous, next)
}

async function persistWindowLock(
  previous: WindowLockRecord | null,
  next: WindowLockRecord | null,
) {
  await persistStateIfChanged(WINDOW_LOCK_STORAGE_KEY, previous, next)
}

async function sendRunnerMessage(tabId: number, message: Record<string, unknown>) {
  try {
    await chrome.tabs.sendMessage(tabId, message)
  } catch (error) {
    console.warn('[SW][Runner] tabs.sendMessage failed', { tabId, message, error })
  }
}

async function updateActiveTitle(
  tabId: number,
  {
    isActive,
    isTryConfirm,
    isMdf,
  }: {
    isActive: boolean
    isTryConfirm: boolean
    isMdf: boolean
  },
) {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId,
      },
      func: setActiveTitle,
      args: [isActive, false, isTryConfirm, isMdf, true, false],
    })
  } catch (error) {
    console.warn('[SW][Runner] scripting.executeScript failed', {
      tabId,
      isActive,
      isTryConfirm,
      isMdf,
      error,
    })
  }
}

async function dispatchRunnerState(
  type: typeof START_MESSAGE_TYPE | typeof STOP_MESSAGE_TYPE,
  runner: RunnerRecord,
) {
  const isActive = type === START_MESSAGE_TYPE
  const tabContext = tabContextByTabIdCache[getTabContextKey(runner.tabId)]

  await updateActiveTitle(runner.tabId, {
    isActive,
    isTryConfirm: tabContext?.isTryConfirm === true,
    isMdf: runner.t !== null,
  })

  await sendRunnerMessage(
    runner.tabId,
    makeRunnerMessage(type, runner),
  )
}

function makeRunnerMessage(type: string, runner: RunnerRecord) {
  return {
    extensionId: chrome.runtime.id,
    type,
    scopeKey: runner.scopeKey,
    world: runner.world,
    t: runner.t,
    tabId: runner.tabId,
    windowId: runner.windowId,
  }
}

async function getFocusedWindowId() {
  const focusedWindow = await chrome.windows.getLastFocused()

  if (
    !focusedWindow
    || focusedWindow.id === undefined
    || focusedWindow.id === chrome.windows.WINDOW_ID_NONE
    || !focusedWindow.focused
  ) {
    return null
  }

  return focusedWindow.id
}

function getScopeFromTabContext(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  const tabContext = tabContextByTabIdCache[getTabContextKey(tabId)]

  if (!tabContext?.world) {
    return null
  }

  return {
    world: tabContext.world,
    t: tabContext.t ?? null,
    scopeKey: `${tabContext.world}:${tabContext.t ?? 'main'}`,
  }
}

function getScopeForTab(tab?: chrome.tabs.Tab | null) {
  if (!tab) {
    return null
  }

  const urlScope = getScopeFromUrl(tab.url)

  if (urlScope) {
    return urlScope
  }

  return getScopeFromTabContext(tab.id)
}

function toWindowLock(runner: RunnerRecord): WindowLockRecord {
  return {
    scopeKey: runner.scopeKey,
    world: runner.world,
    t: runner.t,
    windowId: runner.windowId,
  }
}

async function syncWindowLock(nextLock: WindowLockRecord | null) {
  const previousWindowLock = windowLockCache

  windowLockCache = nextLock
  await persistWindowLock(previousWindowLock, nextLock)

  return previousWindowLock
}

async function getActiveTabInWindow(windowId: number) {
  const activeTabs = await chrome.tabs.query({
    active: true,
    windowId,
  })

  return activeTabs.find((tab) => typeof tab.id === 'number') || null
}

async function getEligibleRunnerFromWindow(windowId: number) {
  const activeTab = await getActiveTabInWindow(windowId)

  if (!activeTab || activeTab.id === undefined) {
    return null
  }

  const scope = getScopeForTab(activeTab)

  if (!scope) {
    return null
  }

  return {
    ...scope,
    windowId,
    tabId: activeTab.id,
  }
}

async function getRunnerFromRecord(runner: RunnerRecord | null) {
  if (!runner) {
    return null
  }

  try {
    const tab = await chrome.tabs.get(runner.tabId)

    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
      return null
    }

    const scope = getScopeForTab(tab)

    if (!scope || scope.scopeKey !== runner.scopeKey) {
      return null
    }

    return {
      ...scope,
      windowId: tab.windowId,
      tabId: tab.id,
    }
  } catch {
    return null
  }
}

async function hasWindow(windowId: number) {
  try {
    await chrome.windows.get(windowId)
    return true
  } catch {
    return false
  }
}

async function getFallbackRunnerFromAnyWindow({
  excludeWindowId,
}: {
  excludeWindowId?: number
} = {}) {
  const activeTabs = await chrome.tabs.query({
    active: true,
  })

  for (const tab of activeTabs) {
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
      continue
    }

     if (typeof excludeWindowId === 'number' && tab.windowId === excludeWindowId) {
      continue
    }

    const scope = getScopeForTab(tab)

    if (!scope) {
      continue
    }

    return {
      ...scope,
      windowId: tab.windowId,
      tabId: tab.id,
    }
  }

  return null
}

async function getDesiredRunner({
  allowFallbackToOtherWindow = false,
}: {
  allowFallbackToOtherWindow?: boolean
} = {}) {
  await ensureCacheLoaded()

  if (windowLockCache?.windowId !== undefined) {
    const lockedWindowExists = await hasWindow(windowLockCache.windowId)
    const previousRunner = getCurrentRunner()

    if (lockedWindowExists) {
      const runnerInLockedWindow = await getEligibleRunnerFromWindow(windowLockCache.windowId)

      if (runnerInLockedWindow) {
        return runnerInLockedWindow
      }

      const runnerInAnotherWindow = await getFallbackRunnerFromAnyWindow({
        excludeWindowId: windowLockCache.windowId,
      })

      if (runnerInAnotherWindow) {
        return runnerInAnotherWindow
      }

      if (previousRunner?.windowId === windowLockCache.windowId) {
        const sameWindowRunner = await getRunnerFromRecord(previousRunner)

        if (sameWindowRunner) {
          return sameWindowRunner
        }
      }

      if (allowFallbackToOtherWindow) {
        return getFallbackRunnerFromAnyWindow()
      }

      return null
    }

    if (!allowFallbackToOtherWindow) {
      return null
    }
  }

  return getFallbackRunnerFromAnyWindow()
}

function toRunnerByScope(desiredRunner: RunnerRecord | null) {
  if (!desiredRunner) {
    return {}
  }

  return {
    [desiredRunner.scopeKey]: desiredRunner,
  }
}

async function syncRunnerByScope(nextRunner: RunnerRecord | null) {
  const previousRunnerByScope = runnerByScopeCache
  const nextRunnerByScope = toRunnerByScope(nextRunner)

  runnerByScopeCache = nextRunnerByScope
  await persistRunnerByScope(previousRunnerByScope, nextRunnerByScope)

  return previousRunnerByScope
}

function createTabContextRecord(
  sender: chrome.runtime.MessageSender,
  data: PreparedMessageData,
) {
  const tabId = sender.tab?.id
  const windowId = sender.tab?.windowId

  if (typeof tabId !== 'number' || typeof windowId !== 'number') {
    return null
  }

  const previousRecord = tabContextByTabIdCache[getTabContextKey(tabId)] || null
  const urlScope = getScopeFromUrl(sender.tab?.url)
  const preparedContext = normalizePreparedContextType(data.context)
  const preparedWorld = normalizeString(data.world)
  const preparedT = normalizeNumber(data.t)
  const hasPreparedIsTryConfirm = Object.prototype.hasOwnProperty.call(data, 'isTryConfirm')
  const preparedIsTryConfirm = normalizeBoolean(data.isTryConfirm)
  const nextWorld = urlScope?.world ?? preparedWorld ?? previousRecord?.world ?? null
  const nextT = urlScope?.t ?? preparedT ?? previousRecord?.t ?? null
  const nextScopeKey = nextWorld ? `${nextWorld}:${nextT ?? 'main'}` : null

  return {
    tabId,
    windowId,
    url: sender.tab?.url ?? null,
    context: preparedContext ?? previousRecord?.context ?? null,
    world: nextWorld,
    t: nextT,
    isTryConfirm: hasPreparedIsTryConfirm
      ? preparedIsTryConfirm
      : previousRecord?.isTryConfirm || false,
    scopeKey: nextScopeKey,
    playerId: normalizeNumber(data.playerId) ?? previousRecord?.playerId ?? null,
    playerName: normalizeString(data.playerName) ?? previousRecord?.playerName ?? null,
    updatedAt: new Date().toISOString(),
  }
}

async function upsertTabContext(
  sender: chrome.runtime.MessageSender,
  data: PreparedMessageData,
) {
  await ensureCacheLoaded()

  const nextRecord = createTabContextRecord(sender, data)

  if (!nextRecord) {
    return null
  }

  const previousCache = tabContextByTabIdCache
  const nextCache = {
    ...previousCache,
    [getTabContextKey(nextRecord.tabId)]: nextRecord,
  }

  tabContextByTabIdCache = nextCache
  await persistTabContextByTabId(previousCache, nextCache)

  return nextRecord
}

async function removeTabContext(tabId?: number) {
  await ensureCacheLoaded()

  if (typeof tabId !== 'number') {
    return
  }

  if (!tabContextByTabIdCache[getTabContextKey(tabId)]) {
    return
  }

  const previousCache = tabContextByTabIdCache
  const nextCache = { ...previousCache }

  delete nextCache[getTabContextKey(tabId)]

  tabContextByTabIdCache = nextCache
  await persistTabContextByTabId(previousCache, nextCache)
}

function getCurrentRunner() {
  return Object.values(runnerByScopeCache)[0] || null
}

function isRunnerForSender(
  runner: RunnerRecord | null,
  sender: chrome.runtime.MessageSender,
) {
  return (
    runner !== null
    && typeof sender.tab?.id === 'number'
    && typeof sender.tab?.windowId === 'number'
    && runner.tabId === sender.tab.id
    && runner.windowId === sender.tab.windowId
  )
}

export async function reconcileActiveRunner(reason = 'unknown') {
  await ensureCacheLoaded()

  const previousRunner = getCurrentRunner()
  const allowFallbackToOtherWindow = (
    reason === 'startup'
    || reason === 'tabs.onRemoved'
    || reason === 'windows.onRemoved'
  )
  const nextRunner = await getDesiredRunner({
    allowFallbackToOtherWindow,
  })

  if (isSameRunner(previousRunner, nextRunner)) {
    if (nextRunner && (reason === 'tabs.onUpdated' || reason === 'startup')) {
      await dispatchRunnerState(START_MESSAGE_TYPE, nextRunner)
    }

    return nextRunner
  }

  await syncRunnerByScope(nextRunner)

  if (!nextRunner && previousRunner && windowLockCache?.windowId === previousRunner.windowId) {
    await syncWindowLock(toWindowLock(previousRunner))
  }

  if (nextRunner) {
    await syncWindowLock(toWindowLock(nextRunner))
  } else if (allowFallbackToOtherWindow) {
    await syncWindowLock(null)
  }

  if (previousRunner && previousRunner.tabId !== nextRunner?.tabId) {
    await dispatchRunnerState(STOP_MESSAGE_TYPE, previousRunner)
  }

  if (nextRunner) {
    await dispatchRunnerState(START_MESSAGE_TYPE, nextRunner)
  }

  console.log('[SW][Runner] reconciled', {
    reason,
    previousRunner,
    nextRunner,
  })

  return nextRunner
}

async function onWindowFocusChanged() {
  return
}

async function onTabActivated(activeInfo: TabActivatedActiveInfo) {
  await ensureCacheLoaded()

  if (pendingDetachedRunner && activeInfo.windowId === pendingDetachedRunner.windowId) {
    return
  }

  await reconcileActiveRunner('tabs.onActivated')
}

async function onTabRemoved(tabId: number, removeInfo: TabRemovedRemoveInfo) {
  await ensureCacheLoaded()

  const previousRunner = getCurrentRunner()
  const wasRunnerTab = previousRunner?.tabId === tabId
  const wasRunnerWindow = windowLockCache?.windowId === removeInfo.windowId

  if (pendingDetachedRunner?.tabId === tabId) {
    pendingDetachedRunner = null
  }

  await removeTabContext(tabId)

  if (!wasRunnerTab && !wasRunnerWindow) {
    return
  }

  await reconcileActiveRunner('tabs.onRemoved')
}

async function onTabAttached(tabId: number, attachInfo: TabAttachedAttachInfo) {
  await ensureCacheLoaded()

  const previousRunner = pendingDetachedRunner || getCurrentRunner()
  const tabContextKey = getTabContextKey(tabId)

  if (!previousRunner || previousRunner.tabId !== tabId) {
    return
  }

  if (tabContextByTabIdCache[tabContextKey]) {
    const previousCache = tabContextByTabIdCache
    const nextCache = {
      ...previousCache,
      [tabContextKey]: {
        ...previousCache[tabContextKey],
        windowId: attachInfo.newWindowId,
      },
    }

    tabContextByTabIdCache = nextCache
    await persistTabContextByTabId(previousCache, nextCache)
  }

  const movedRunner = {
    ...previousRunner,
    windowId: attachInfo.newWindowId,
  }

  pendingDetachedRunner = null
  await syncRunnerByScope(movedRunner)
  await syncWindowLock(toWindowLock(movedRunner))
  await dispatchRunnerState(START_MESSAGE_TYPE, movedRunner)
}

async function onTabDetached(tabId: number, _detachInfo: TabDetachedDetachInfo) {
  await ensureCacheLoaded()

  const previousRunner = getCurrentRunner()

  if (!previousRunner || previousRunner.tabId !== tabId) {
    return
  }

  pendingDetachedRunner = previousRunner
}

async function onWindowRemoved(windowId: number) {
  await ensureCacheLoaded()

  if (pendingDetachedRunner?.windowId === windowId) {
    return
  }

  if (windowLockCache?.windowId !== windowId) {
    return
  }

  await reconcileActiveRunner('windows.onRemoved')
}

async function onTabUpdated(
  tabId: number,
  changeInfo: TabUpdatedChangeInfo,
) {
  await ensureCacheLoaded()

  if (pendingDetachedRunner) {
    return
  }

  if (!changeInfo.url && !changeInfo.status) {
    return
  }

  if (changeInfo.url && tabContextByTabIdCache[getTabContextKey(tabId)]) {
    const previousCache = tabContextByTabIdCache
    const nextCache = {
      ...previousCache,
      [getTabContextKey(tabId)]: {
        ...previousCache[getTabContextKey(tabId)],
        url: changeInfo.url,
      },
    }

    tabContextByTabIdCache = nextCache
    await persistTabContextByTabId(previousCache, nextCache)
  }

  await reconcileActiveRunner('tabs.onUpdated')
}

export function getConnectState(sender: chrome.runtime.MessageSender) {
  return {
    ok: true,
    extensionId: chrome.runtime.id,
    type: CONNECT_MESSAGE_TYPE,
    tabId: sender.tab?.id ?? null,
    windowId: sender.tab?.windowId ?? null,
  }
}

export async function registerPreparedContext(
  received: { data?: PreparedMessageData },
  sender: chrome.runtime.MessageSender,
) {
  const tabContext = await upsertTabContext(sender, received.data || {})

  if (!tabContext) {
    return {
      ok: false,
      error: 'Missing sender tab context',
      type: PREPARED_MESSAGE_TYPE,
    }
  }

  const nextRunner = await reconcileActiveRunner('PREPARED')
  const isActive = isRunnerForSender(nextRunner, sender)

  if (isActive) {
    await dispatchRunnerState(START_MESSAGE_TYPE, nextRunner as RunnerRecord)
  }

  return {
    ok: true,
    type: PREPARED_MESSAGE_TYPE,
    active: isActive,
    scopeKey: tabContext.scopeKey,
    context: tabContext.context,
    world: tabContext.world,
    t: tabContext.t,
    tabId: tabContext.tabId,
    windowId: tabContext.windowId,
  }
}

export async function registerRunnerLifecycleListeners() {
  await ensureCacheLoaded()

  if (!windowLockCache) {
    const currentRunner = getCurrentRunner()

    if (currentRunner) {
      await syncWindowLock(toWindowLock(currentRunner))
    }
  }

  if (!chrome.tabs.onActivated.hasListener(onTabActivated)) {
    chrome.tabs.onActivated.addListener(onTabActivated)
  }

  if (!chrome.tabs.onRemoved.hasListener(onTabRemoved)) {
    chrome.tabs.onRemoved.addListener(onTabRemoved)
  }

  if (!chrome.tabs.onAttached.hasListener(onTabAttached)) {
    chrome.tabs.onAttached.addListener(onTabAttached)
  }

  if (!chrome.tabs.onDetached.hasListener(onTabDetached)) {
    chrome.tabs.onDetached.addListener(onTabDetached)
  }

  if (!chrome.tabs.onUpdated.hasListener(onTabUpdated)) {
    chrome.tabs.onUpdated.addListener(onTabUpdated)
  }

  if (!chrome.windows.onFocusChanged.hasListener(onWindowFocusChanged)) {
    chrome.windows.onFocusChanged.addListener(onWindowFocusChanged)
  }

  if (!chrome.windows.onRemoved.hasListener(onWindowRemoved)) {
    chrome.windows.onRemoved.addListener(onWindowRemoved)
  }

  await reconcileActiveRunner('startup')
}
