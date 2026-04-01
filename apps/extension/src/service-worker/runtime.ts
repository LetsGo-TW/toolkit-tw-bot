/// <reference types="chrome" />

import { ensureEnabledByUserLoaded, getPlayerEnabledByUser } from './enabled-by-user'
import { syncKnownTabActions, syncRunnerActions } from './action-state'
import {
  ensurePreparedContextLoaded,
  getPreparedContextScopeKeys,
  getTabContext,
} from './prepared-context'
import {
  getCurrentRunners,
  getDesiredRunner,
  getRunnerByScope,
  getWindowLock,
  getWindowLocks,
  isSameRunner,
  type RunnerByScope,
  type RunnerRecord,
  syncRunnerByScope,
  syncWindowLock,
  toWindowLock,
  ensureRunnerTabsLoaded,
} from './runner-tabs'
import {
  START_MESSAGE_TYPE,
  STOP_MESSAGE_TYPE,
} from './message/types'

type ReconcileActiveRunnerOptions = {
  preferredWindowId?: number | null
  reason?: string
  targetScopeKey?: string | null
}

type RunnerCommandData = {
  isRunningTab: boolean
  enabledByUser: boolean
  isAllowedByLicense: boolean
  isLicenseExpiring: boolean
  isTryConfirm: boolean
  isMdfScope: boolean
}

function normalizeReconcileActiveRunnerOptions(
  optionsOrReason: string | ReconcileActiveRunnerOptions = 'unknown',
) {
  if (typeof optionsOrReason === 'string') {
    return {
      preferredWindowId: null,
      reason: optionsOrReason,
      targetScopeKey: null,
    }
  }

  return {
    preferredWindowId: optionsOrReason.preferredWindowId ?? null,
    reason: optionsOrReason.reason ?? 'unknown',
    targetScopeKey: optionsOrReason.targetScopeKey ?? null,
  }
}

function getTrackedWindowLock(
  scopeKey: string,
) {
  const currentRunner = getRunnerByScope(scopeKey)

  if (currentRunner) {
    return toWindowLock(currentRunner)
  }

  const currentWindowLock = getWindowLock(scopeKey)

  if (!currentWindowLock) {
    return null
  }

  return currentWindowLock
}

function getKnownScopeKeys(targetScopeKey?: string | null) {
  return Array.from(
    new Set([
      ...Object.keys(getCurrentRunners()),
      ...Object.keys(getWindowLocks()),
      ...getPreparedContextScopeKeys(),
      ...(targetScopeKey ? [targetScopeKey] : []),
    ]),
  ).filter((scopeKey) => scopeKey.length > 0)
}

function isSameRunnerByScope(previous: RunnerByScope, next: RunnerByScope) {
  const scopeKeys = new Set([
    ...Object.keys(previous),
    ...Object.keys(next),
  ])

  for (const scopeKey of scopeKeys) {
    if (!isSameRunner(previous[scopeKey] || null, next[scopeKey] || null)) {
      return false
    }
  }

  return true
}

function createNextWindowLocksByScope(
  previousWindowLocks: ReturnType<typeof getWindowLocks>,
  nextRunnerByScope: RunnerByScope,
) {
  const nextWindowLocksByScope = { ...previousWindowLocks }
  const scopeKeys = new Set([
    ...Object.keys(previousWindowLocks),
    ...Object.keys(nextRunnerByScope),
  ])

  for (const scopeKey of scopeKeys) {
    const nextRunner = nextRunnerByScope[scopeKey] || null

    if (nextRunner) {
      nextWindowLocksByScope[scopeKey] = toWindowLock(nextRunner)
      continue
    }

    const trackedWindowLock = getTrackedWindowLock(scopeKey)

    if (trackedWindowLock) {
      nextWindowLocksByScope[scopeKey] = trackedWindowLock
      continue
    }

    delete nextWindowLocksByScope[scopeKey]
  }

  return nextWindowLocksByScope
}

function createRunnerCommandData(
  runner: RunnerRecord | null,
  {
    isRunningTab,
  }: {
    isRunningTab: boolean
  },
): RunnerCommandData {
  const tabContext = runner ? getTabContext(runner.tabId) : null

  return {
    isRunningTab,
    enabledByUser: getPlayerEnabledByUser(
      tabContext?.world ?? null,
      tabContext?.playerId ?? null,
    ),
    isAllowedByLicense: true,
    isLicenseExpiring: false,
    isTryConfirm: tabContext?.isTryConfirm === true,
    isMdfScope: tabContext?.t !== null,
  }
}

async function postRunnerCommand(
  runner: RunnerRecord | null,
  {
    type,
    data,
  }: {
    type: string
    data: RunnerCommandData
  },
) {
  if (!runner) {
    return
  }

  try {
    console.log('[SW][Runner] send', {
      at: new Date().toISOString(),
      tabId: runner.tabId,
      windowId: runner.windowId,
      scopeKey: runner.scopeKey,
      type,
      data,
    })

    await chrome.tabs.sendMessage(runner.tabId, {
      extensionId: chrome.runtime.id,
      type,
      scopeKey: runner.scopeKey,
      data,
    })
  } catch (error) {
    console.warn('[SW][Runner] tabs.sendMessage failed', {
      tabId: runner.tabId,
      windowId: runner.windowId,
      scopeKey: runner.scopeKey,
      type,
      error,
    })
  }
}

export async function reconcileActiveRunner(
  optionsOrReason: string | ReconcileActiveRunnerOptions = 'unknown',
) {
  const reconcileStartedAt = Date.now()
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()

  const {
    preferredWindowId,
    reason,
    targetScopeKey,
  } = normalizeReconcileActiveRunnerOptions(optionsOrReason)

  console.log('[SW][Runner] reconcile:start', {
    at: new Date().toISOString(),
    reason,
    preferredWindowId,
    targetScopeKey,
  })

  const previousRunnerByScope = getCurrentRunners()
  const previousWindowLocks = getWindowLocks()
  const knownScopeKeys = getKnownScopeKeys(targetScopeKey)
  const nextRunnerEntries = await Promise.all(
    knownScopeKeys.map(async (scopeKey) => {
      const hasTrackedState = Boolean(
        getRunnerByScope(scopeKey)
        || getWindowLock(scopeKey),
      )
      const nextRunner = await getDesiredRunner({
        scopeKey,
        preferredWindowId: !hasTrackedState
          ? preferredWindowId
          : null,
      })

      return nextRunner
        ? [scopeKey, nextRunner] as const
        : null
    }),
  )
  const nextRunnerByScope = Object.fromEntries(
    nextRunnerEntries.filter(Boolean),
  ) as RunnerByScope

  console.log('[SW][Runner] reconcile:resolved', {
    at: new Date().toISOString(),
    reason,
    preferredWindowId,
    targetScopeKey,
    knownScopeKeys,
    previousRunnerByScope,
    nextRunnerByScope,
    durationMs: Date.now() - reconcileStartedAt,
  })

  if (isSameRunnerByScope(previousRunnerByScope, nextRunnerByScope)) {
    if (reason === 'startup') {
      await Promise.all(
        Object.values(nextRunnerByScope).map(async (nextRunner) => {
          const nextData = createRunnerCommandData(nextRunner, {
            isRunningTab: true,
          })

          await postRunnerCommand(nextRunner, {
            type: nextData.enabledByUser
              ? START_MESSAGE_TYPE
              : STOP_MESSAGE_TYPE,
            data: nextData,
          })
        }),
      )
    }

    await syncRunnerActions(previousRunnerByScope, nextRunnerByScope)

    console.log('[SW][Runner] reconcile:done', {
      at: new Date().toISOString(),
      reason,
      changed: false,
      durationMs: Date.now() - reconcileStartedAt,
    })

    return nextRunnerByScope
  }

  const nextWindowLocksByScope = createNextWindowLocksByScope(
    previousWindowLocks,
    nextRunnerByScope,
  )
  const persistRunnerByScopePromise = syncRunnerByScope(nextRunnerByScope)
  const persistWindowLockPromise = syncWindowLock(nextWindowLocksByScope)

  const affectedScopeKeys = new Set([
    ...Object.keys(previousRunnerByScope),
    ...Object.keys(nextRunnerByScope),
  ])

  for (const scopeKey of affectedScopeKeys) {
    const previousRunner = previousRunnerByScope[scopeKey] || null
    const nextRunner = nextRunnerByScope[scopeKey] || null

    if (previousRunner && !isSameRunner(previousRunner, nextRunner)) {
      await postRunnerCommand(previousRunner, {
        type: STOP_MESSAGE_TYPE,
        data: createRunnerCommandData(previousRunner, {
          isRunningTab: false,
        }),
      })
    }

    if (nextRunner && !isSameRunner(previousRunner, nextRunner)) {
      const nextData = createRunnerCommandData(nextRunner, {
        isRunningTab: true,
      })

      await postRunnerCommand(nextRunner, {
        type: nextData.enabledByUser && nextData.isAllowedByLicense
          ? START_MESSAGE_TYPE
          : STOP_MESSAGE_TYPE,
        data: nextData,
      })
    }
  }

  await Promise.all([
    persistRunnerByScopePromise,
    persistWindowLockPromise,
  ])

  await syncRunnerActions(previousRunnerByScope, nextRunnerByScope)

  console.log('[SW][Runner] reconcile:done', {
    at: new Date().toISOString(),
    reason,
    changed: true,
    durationMs: Date.now() - reconcileStartedAt,
  })

  return nextRunnerByScope
}

export async function initializeRuntime() {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()

  if (!Object.keys(getWindowLocks()).length) {
    const currentRunnerByScope = getCurrentRunners()

    if (Object.keys(currentRunnerByScope).length) {
      await syncWindowLock(
        Object.fromEntries(
          Object.entries(currentRunnerByScope).map(([scopeKey, runner]) => [
            scopeKey,
            toWindowLock(runner),
          ]),
        ),
      )
    }
  }

  let preferredWindowId: number | null = null

  try {
    const focusedWindow = await chrome.windows.getLastFocused()

    preferredWindowId = typeof focusedWindow.id === 'number'
      ? focusedWindow.id
      : null
  } catch {
    preferredWindowId = null
  }

  await reconcileActiveRunner({
    preferredWindowId,
    reason: 'startup',
  })
  await syncKnownTabActions()
}
