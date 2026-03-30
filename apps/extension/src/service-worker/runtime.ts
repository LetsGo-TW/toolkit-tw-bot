/// <reference types="chrome" />

import { ensureEnabledByUserLoaded, getPlayerEnabledByUser } from './enabled-by-user'
import { syncKnownTabActions, syncRunnerActions } from './action-state'
import { ensurePreparedContextLoaded, getTabContext } from './prepared-context'
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
import {
  PREPARED_MESSAGE_TYPE,
  START_MESSAGE_TYPE,
  STOP_MESSAGE_TYPE,
} from './message/types'

type ReconcileActiveRunnerOptions = {
  preferredWindowId?: number | null
  reason?: string
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
    enabledByUser: typeof tabContext?.playerId === 'number'
      ? getPlayerEnabledByUser(tabContext.playerId)
      : true,
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
      const nextData = createRunnerCommandData(nextRunner, {
        isRunningTab: true,
      })

      await postRunnerCommand(nextRunner, {
        type: nextData.enabledByUser
          ? START_MESSAGE_TYPE
          : STOP_MESSAGE_TYPE,
        data: nextData,
      })
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

  if (previousRunner) {
    await postRunnerCommand(previousRunner, {
      type: STOP_MESSAGE_TYPE,
      data: createRunnerCommandData(previousRunner, {
        isRunningTab: false,
      }),
    })
  }

  if (nextRunner) {
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
