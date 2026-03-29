/// <reference types="chrome" />

import {
  ensurePreparedContextLoaded,
  getScopeForTab,
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

let cacheLoaded = false
let runnerByScopeCache: RunnerByScope = {}
let windowLockCache: WindowLockRecord | null = null

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

async function sanitizeRunnerRecord(record: RunnerRecord | null) {
  if (!record) {
    return null
  }

  try {
    const tab = await chrome.tabs.get(record.tabId)
    const scope = getScopeForTab(tab)

    if (!scope) {
      return null
    }

    if (typeof tab.windowId !== 'number' || tab.windowId !== record.windowId) {
      return null
    }

    if (
      scope.scopeKey !== record.scopeKey
      || scope.world !== record.world
      || (scope.t ?? null) !== (record.t ?? null)
    ) {
      return null
    }

    return {
      ...record,
      windowId: tab.windowId,
      tabId: tab.id!,
    }
  } catch {
    return null
  }
}

async function sanitizeRunnerByScope(value: RunnerByScope) {
  const nextEntries = await Promise.all(
    Object.entries(value).map(async ([scopeKey, runner]) => {
      const sanitizedRunner = await sanitizeRunnerRecord(runner)

      if (!sanitizedRunner) {
        return null
      }

      return [scopeKey, sanitizedRunner] as const
    }),
  )

  return Object.fromEntries(nextEntries.filter(Boolean)) as RunnerByScope
}

async function sanitizeWindowLock(value: WindowLockRecord | null) {
  if (!value) {
    return null
  }

  const activeTab = await getActiveTabInWindow(value.windowId)
  const scope = getScopeForTab(activeTab)

  if (
    !scope
    || scope.scopeKey !== value.scopeKey
    || scope.world !== value.world
    || (scope.t ?? null) !== (value.t ?? null)
  ) {
    return null
  }

  return {
    scopeKey: scope.scopeKey,
    world: scope.world,
    t: scope.t,
    windowId: value.windowId,
  }
}

export async function ensureRunnerTabsLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([
    RUNNER_STORAGE_KEY,
    WINDOW_LOCK_STORAGE_KEY,
  ])

  const normalizedRunnerByScope = normalizeRunnerByScope(stored[RUNNER_STORAGE_KEY])
  const sanitizedRunnerByScope = await sanitizeRunnerByScope(normalizedRunnerByScope)
  const normalizedWindowLock = normalizeWindowLock(stored[WINDOW_LOCK_STORAGE_KEY])

  runnerByScopeCache = sanitizedRunnerByScope
  windowLockCache = await sanitizeWindowLock(normalizedWindowLock)
  cacheLoaded = true

  await persistRunnerByScope(normalizedRunnerByScope, runnerByScopeCache)
  await persistWindowLock(normalizedWindowLock, windowLockCache)
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

export function toWindowLock(runner: RunnerRecord): WindowLockRecord {
  return {
    scopeKey: runner.scopeKey,
    world: runner.world,
    t: runner.t,
    windowId: runner.windowId,
  }
}

function matchesScopeKey(
  runner: RunnerRecord | null,
  scopeKey?: string | null,
) {
  if (!runner) {
    return false
  }

  if (!scopeKey) {
    return true
  }

  return runner.scopeKey === scopeKey
}

async function getActiveTabInWindow(windowId: number) {
  try {
    const activeTabs = await chrome.tabs.query({
      active: true,
      windowId,
    })

    return activeTabs.find((tab) => typeof tab.id === 'number') || null
  } catch {
    return null
  }
}

async function getEligibleRunnerFromWindow(
  windowId: number,
  {
    scopeKey,
  }: {
    scopeKey?: string | null
  } = {},
) {
  const activeTab = await getActiveTabInWindow(windowId)

  if (!activeTab || activeTab.id === undefined) {
    return null
  }

  const scope = getScopeForTab(activeTab)

  if (!scope) {
    return null
  }

  const runner = {
    ...scope,
    windowId,
    tabId: activeTab.id,
  }

  return matchesScopeKey(runner, scopeKey)
    ? runner
    : null
}

async function getFallbackRunnerFromAnyWindow({
  excludeWindowId,
  scopeKey,
}: {
  excludeWindowId?: number
  scopeKey?: string | null
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

    const runner = {
      ...scope,
      windowId: tab.windowId,
      tabId: tab.id,
    }

    if (!matchesScopeKey(runner, scopeKey)) {
      continue
    }

    return runner
  }

  return null
}

export async function getDesiredRunner({
  preferredWindowId,
}: {
  preferredWindowId?: number | null
} = {}) {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()

  const currentScopeKey = getCurrentRunner()?.scopeKey || windowLockCache?.scopeKey || null
  const nextPreferredWindowId = typeof preferredWindowId === 'number'
    ? preferredWindowId
    : windowLockCache?.windowId ?? getCurrentRunner()?.windowId ?? null

  if (typeof nextPreferredWindowId !== 'number') {
    return null
  }

  const runnerInPreferredWindow = await getEligibleRunnerFromWindow(nextPreferredWindowId, {
    scopeKey: currentScopeKey,
  })

  if (runnerInPreferredWindow) {
    return runnerInPreferredWindow
  }

  return getFallbackRunnerFromAnyWindow({
    excludeWindowId: nextPreferredWindowId,
    scopeKey: currentScopeKey,
  })
}
