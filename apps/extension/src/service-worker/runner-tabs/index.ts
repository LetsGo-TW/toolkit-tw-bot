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

export type RunnerByScope = Record<string, RunnerRecord>

export type WindowLockRecord = {
  scopeKey: string
  world: string
  t: number | null
  windowId: number
}

export type WindowLockByScope = Record<string, WindowLockRecord>

let cacheLoaded = false
let runnerByScopeCache: RunnerByScope = {}
let windowLockByScopeCache: WindowLockByScope = {}

function normalizeRunnerByScope(value: unknown): RunnerByScope {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as RunnerByScope
}

function normalizeWindowLockByScope(value: unknown): WindowLockByScope {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const candidate = value as Partial<WindowLockRecord>

  if (
    typeof candidate.scopeKey === 'string'
    && typeof candidate.world === 'string'
    && typeof candidate.windowId === 'number'
  ) {
    return {
      [candidate.scopeKey]: {
        scopeKey: candidate.scopeKey,
        world: candidate.world,
        t: candidate.t ?? null,
        windowId: candidate.windowId,
      },
    }
  }

  return value as WindowLockByScope
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
  previous: WindowLockByScope,
  next: WindowLockByScope,
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

async function sanitizeWindowLockRecord(value: WindowLockRecord | null) {
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

async function sanitizeWindowLockByScope(value: WindowLockByScope) {
  const nextEntries = await Promise.all(
    Object.entries(value).map(async ([scopeKey, windowLock]) => {
      const sanitizedWindowLock = await sanitizeWindowLockRecord(windowLock)

      if (!sanitizedWindowLock) {
        return null
      }

      return [scopeKey, sanitizedWindowLock] as const
    }),
  )

  return Object.fromEntries(nextEntries.filter(Boolean)) as WindowLockByScope
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
  const normalizedWindowLockByScope = normalizeWindowLockByScope(stored[WINDOW_LOCK_STORAGE_KEY])
  const sanitizedWindowLockByScope = await sanitizeWindowLockByScope(normalizedWindowLockByScope)

  runnerByScopeCache = sanitizedRunnerByScope
  windowLockByScopeCache = sanitizedWindowLockByScope
  cacheLoaded = true

  await persistRunnerByScope(normalizedRunnerByScope, runnerByScopeCache)
  await persistWindowLock(normalizedWindowLockByScope, windowLockByScopeCache)
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

export function getCurrentRunners() {
  return { ...runnerByScopeCache }
}

export function getRunnerByScope(scopeKey?: string | null) {
  if (!scopeKey) {
    return null
  }

  return runnerByScopeCache[scopeKey] || null
}

export function getRunnerForTab(tabId?: number | null, windowId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  return Object.values(runnerByScopeCache).find((runner) => (
    runner.tabId === tabId
    && (
      typeof windowId !== 'number'
      || runner.windowId === windowId
    )
  )) || null
}

export async function syncRunnerByScope(nextRunnerByScope: RunnerByScope) {
  const previousRunnerByScope = runnerByScopeCache

  runnerByScopeCache = nextRunnerByScope
  await persistRunnerByScope(previousRunnerByScope, nextRunnerByScope)

  return previousRunnerByScope
}

export function getWindowLock(scopeKey?: string | null) {
  if (scopeKey) {
    return windowLockByScopeCache[scopeKey] || null
  }

  return Object.values(windowLockByScopeCache)[0] || null
}

export function getWindowLocks() {
  return { ...windowLockByScopeCache }
}

export async function syncWindowLock(nextLockByScope: WindowLockByScope) {
  const previousWindowLockByScope = windowLockByScopeCache

  windowLockByScopeCache = nextLockByScope
  await persistWindowLock(previousWindowLockByScope, nextLockByScope)

  return previousWindowLockByScope
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
  scopeKey,
  preferredWindowId,
}: {
  scopeKey: string
  preferredWindowId?: number | null
}) {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()

  const nextPreferredWindowId = typeof preferredWindowId === 'number'
    ? preferredWindowId
    : getWindowLock(scopeKey)?.windowId ?? getRunnerByScope(scopeKey)?.windowId ?? null

  if (typeof nextPreferredWindowId !== 'number') {
    return null
  }

  const runnerInPreferredWindow = await getEligibleRunnerFromWindow(nextPreferredWindowId, {
    scopeKey,
  })

  if (runnerInPreferredWindow) {
    return runnerInPreferredWindow
  }

  return getFallbackRunnerFromAnyWindow({
    excludeWindowId: nextPreferredWindowId,
    scopeKey,
  })
}
