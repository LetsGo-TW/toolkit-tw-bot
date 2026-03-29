/// <reference types="chrome" />

import { ensureEnabledByUserLoaded } from './enabled-by-user'
import { syncKnownTabActions, syncRunnerActions } from './action-state'
import { ensurePreparedContextLoaded } from './prepared-context'
import {
  getCurrentRunner,
  getDesiredRunner,
  getWindowLock,
  isSameRunner,
  type RunnerRecord,
  syncRunnerByScope,
  syncWindowLock,
  toWindowLock,
  ensureRunnerTabsLoaded,
} from './runner-tabs'
import { PREPARED_MESSAGE_TYPE } from './message/types'
import { setActiveTitle } from './runner-tabs/setActiveTitle'

type ReconcileActiveRunnerOptions = {
  preferredWindowId?: number | null
  reason?: string
}

function normalizeReconcileActiveRunnerOptions(
  optionsOrReason: string | ReconcileActiveRunnerOptions = 'unknown',
) {
  if (typeof optionsOrReason === 'string') {
    return {
      preferredWindowId: null,
      reason: optionsOrReason,
    }
  }

  return {
    preferredWindowId: optionsOrReason.preferredWindowId ?? null,
    reason: optionsOrReason.reason ?? 'unknown',
  }
}

function getTrackedWindowLock(preferredWindowId?: number | null) {
  const currentRunner = getCurrentRunner()

  if (currentRunner) {
    return {
      ...toWindowLock(currentRunner),
      windowId: typeof preferredWindowId === 'number'
        ? preferredWindowId
        : currentRunner.windowId,
    }
  }

  const currentWindowLock = getWindowLock()

  if (!currentWindowLock) {
    return null
  }

  return {
    ...currentWindowLock,
    windowId: typeof preferredWindowId === 'number'
      ? preferredWindowId
      : currentWindowLock.windowId,
  }
}

async function updateActiveTitle(
  tabId: number,
  {
    isRunningTab,
  }: {
    isRunningTab: boolean
  },
) {
  try {
    await chrome.scripting.executeScript({
      target: {
        tabId,
      },
      func: setActiveTitle,
      args: [{
        isRunningTab,
      }],
    })
  } catch (error) {
    console.warn('[SW][Runner] scripting.executeScript failed', {
      tabId,
      isRunningTab,
      error,
    })
  }
}

export async function syncSelectedRunnerState(runner: RunnerRecord) {
  await updateActiveTitle(runner.tabId, {
    isRunningTab: true,
  })
}

export async function reconcileActiveRunner(
  optionsOrReason: string | ReconcileActiveRunnerOptions = 'unknown',
) {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()

  const {
    preferredWindowId,
    reason,
  } = normalizeReconcileActiveRunnerOptions(optionsOrReason)
  const previousRunner = getCurrentRunner()

  const nextRunner = await getDesiredRunner({
    preferredWindowId,
  })

  if (isSameRunner(previousRunner, nextRunner)) {
    if (
      nextRunner
      && (reason === 'startup' || reason === PREPARED_MESSAGE_TYPE)
    ) {
      await syncSelectedRunnerState(nextRunner)
    }

    await syncRunnerActions(previousRunner, nextRunner)

    return nextRunner
  }

  await syncRunnerByScope(nextRunner)

  await syncWindowLock(
    nextRunner
      ? toWindowLock(nextRunner)
      : getTrackedWindowLock(preferredWindowId),
  )

  if (previousRunner && previousRunner.tabId !== nextRunner?.tabId) {
    await updateActiveTitle(previousRunner.tabId, {
      isRunningTab: false,
    })
  }

  if (nextRunner) {
    await syncSelectedRunnerState(nextRunner)
  }

  await syncRunnerActions(previousRunner, nextRunner)

  return nextRunner
}

export async function initializeRuntime() {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()

  if (!getWindowLock()) {
    const currentRunner = getCurrentRunner()

    if (currentRunner) {
      await syncWindowLock(toWindowLock(currentRunner))
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
