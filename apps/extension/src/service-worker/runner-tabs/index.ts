/// <reference types="chrome" />

import {
  ensurePreparedContextLoaded,
  getScopeForTab,
  removePreparedContext,
  syncPreparedContextWindowId,
  updatePreparedContextFromUrl,
} from '../prepared-context'

const RUNNER_STORAGE_KEY = 'runnerByScope'
const WINDOW_LOCK_STORAGE_KEY = 'windowLock'

export type RunnerRecord = {
  scopeKey: string
  world: string
  t: number | null
  windowId: number
  tabId: number
}

type RunnerByScope = Record<string, RunnerRecord>

export type WindowLockRecord = {
  scopeKey: string
  world: string
  t: number | null
  windowId: number
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
let windowLockCache: WindowLockRecord | null = null
let pendingDetachedRunner: RunnerRecord | null = null

function normalizeRunnerByScope(value: unknown): RunnerByScope {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as RunnerByScope
}

function normalizeWindowLock(value: unknown): WindowLockRecord | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  return value as WindowLockRecord
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

async function persistWindowLock(
  previous: WindowLockRecord | null,
  next: WindowLockRecord | null,
) {
  await persistStateIfChanged(WINDOW_LOCK_STORAGE_KEY, previous, next)
}

export async function ensureRunnerTabsLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([
    RUNNER_STORAGE_KEY,
    WINDOW_LOCK_STORAGE_KEY,
  ])

  runnerByScopeCache = normalizeRunnerByScope(stored[RUNNER_STORAGE_KEY])
  windowLockCache = normalizeWindowLock(stored[WINDOW_LOCK_STORAGE_KEY])
  cacheLoaded = true
}

export function isSameRunner(a: RunnerRecord | null, b: RunnerRecord | null) {
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

export function getCurrentRunner() {
  return Object.values(runnerByScopeCache)[0] || null
}

export async function syncRunnerByScope(nextRunner: RunnerRecord | null) {
  const previousRunnerByScope = runnerByScopeCache
  const nextRunnerByScope = nextRunner
    ? { [nextRunner.scopeKey]: nextRunner }
    : {}

  runnerByScopeCache = nextRunnerByScope
  await persistRunnerByScope(previousRunnerByScope, nextRunnerByScope)

  return previousRunnerByScope
}

export function getWindowLock() {
  return windowLockCache
}

export async function syncWindowLock(nextLock: WindowLockRecord | null) {
  const previousWindowLock = windowLockCache

  windowLockCache = nextLock
  await persistWindowLock(previousWindowLock, nextLock)

  return previousWindowLock
}

export function getPendingDetachedRunner() {
  return pendingDetachedRunner
}

export function setPendingDetachedRunner(nextRunner: RunnerRecord | null) {
  pendingDetachedRunner = nextRunner
}

export function toWindowLock(runner: RunnerRecord): WindowLockRecord {
  return {
    scopeKey: runner.scopeKey,
    world: runner.world,
    t: runner.t,
    windowId: runner.windowId,
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

export async function getDesiredRunner({
  allowFallbackToOtherWindow = false,
}: {
  allowFallbackToOtherWindow?: boolean
} = {}) {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()

  if (windowLockCache?.windowId !== undefined) {
    const lockedWindowExists = await hasWindow(windowLockCache.windowId)

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

type RunnerTabsListenerDeps = {
  reconcileActiveRunner: (reason?: string) => Promise<RunnerRecord | null>
  syncSelectedRunnerState: (runner: RunnerRecord) => Promise<void>
  syncTabActionByTabId: (tabId?: number | null) => Promise<void>
}

export function createRunnerTabsListeners({
  reconcileActiveRunner,
  syncSelectedRunnerState,
  syncTabActionByTabId,
}: RunnerTabsListenerDeps) {
  const onWindowFocusChanged = async () => {
    return
  }

  const onTabActivated = async (activeInfo: TabActivatedActiveInfo) => {
    await ensureRunnerTabsLoaded()

    if (pendingDetachedRunner && activeInfo.windowId === pendingDetachedRunner.windowId) {
      return
    }

    await reconcileActiveRunner('tabs.onActivated')
  }

  const onTabRemoved = async (
    tabId: number,
    removeInfo: TabRemovedRemoveInfo,
  ) => {
    await ensureRunnerTabsLoaded()

    const previousRunner = getCurrentRunner()
    const wasRunnerTab = previousRunner?.tabId === tabId
    const wasRunnerWindow = windowLockCache?.windowId === removeInfo.windowId

    if (pendingDetachedRunner?.tabId === tabId) {
      pendingDetachedRunner = null
    }

    await removePreparedContext(tabId)

    if (!wasRunnerTab && !wasRunnerWindow) {
      return
    }

    await reconcileActiveRunner('tabs.onRemoved')
  }

  const onTabAttached = async (
    tabId: number,
    attachInfo: TabAttachedAttachInfo,
  ) => {
    await ensureRunnerTabsLoaded()

    const previousRunner = pendingDetachedRunner || getCurrentRunner()

    if (!previousRunner || previousRunner.tabId !== tabId) {
      return
    }

    await syncPreparedContextWindowId(tabId, attachInfo.newWindowId)

    const movedRunner = {
      ...previousRunner,
      windowId: attachInfo.newWindowId,
    }

    pendingDetachedRunner = null
    await syncRunnerByScope(movedRunner)
    await syncWindowLock(toWindowLock(movedRunner))
    await syncSelectedRunnerState(movedRunner)
  }

  const onTabDetached = async (
    tabId: number,
    _detachInfo: TabDetachedDetachInfo,
  ) => {
    await ensureRunnerTabsLoaded()

    const previousRunner = getCurrentRunner()

    if (!previousRunner || previousRunner.tabId !== tabId) {
      return
    }

    pendingDetachedRunner = previousRunner
  }

  const onWindowRemoved = async (windowId: number) => {
    await ensureRunnerTabsLoaded()

    if (pendingDetachedRunner?.windowId === windowId) {
      return
    }

    if (windowLockCache?.windowId !== windowId) {
      return
    }

    await reconcileActiveRunner('windows.onRemoved')
  }

  const onTabUpdated = async (
    tabId: number,
    changeInfo: TabUpdatedChangeInfo,
  ) => {
    await ensureRunnerTabsLoaded()

    if (pendingDetachedRunner) {
      return
    }

    if (!changeInfo.url && !changeInfo.status) {
      return
    }

    if (changeInfo.url) {
      await updatePreparedContextFromUrl(tabId, changeInfo.url)
    }

    await reconcileActiveRunner('tabs.onUpdated')
    await syncTabActionByTabId(tabId)
  }

  return {
    onWindowFocusChanged,
    onTabActivated,
    onTabRemoved,
    onTabAttached,
    onTabDetached,
    onWindowRemoved,
    onTabUpdated,
  }
}
