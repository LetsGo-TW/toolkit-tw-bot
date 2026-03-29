/// <reference types="chrome" />

import { createLicenseState } from '../types'
import { getPlayerEnabledByUser, ensureEnabledByUserLoaded } from './enabled-by-user'
import { syncKnownTabActions, syncRunnerActions } from './action-state'
import {
  ensurePreparedContextLoaded,
  getTabContext,
} from './prepared-context'
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
  SET_ENABLED_BY_USER_MESSAGE_TYPE,
  START_MESSAGE_TYPE,
  STOP_MESSAGE_TYPE,
} from './message/types'
import { setActiveTitle } from './runner-tabs/setActiveTitle'

function getLicenseState() {
  return createLicenseState()
}

function canExecuteRunner(runner?: RunnerRecord | null) {
  if (!runner) {
    return false
  }

  const tabContext = getTabContext(runner.tabId)

  return (
    getPlayerEnabledByUser(tabContext?.playerId)
    && getLicenseState().allowedByLicense
  )
}

async function sendRunnerMessage(
  tabId: number,
  type: typeof START_MESSAGE_TYPE | typeof STOP_MESSAGE_TYPE,
  scopeKey: string,
) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      extensionId: chrome.runtime.id,
      type,
      scopeKey,
    })
  } catch (error) {
    console.warn('[SW][Runner] tabs.sendMessage failed', { tabId, type, scopeKey, error })
  }
}

async function updateActiveTitle(
  tabId: number,
  {
    isRunningTab,
    enabledByUser,
    isTryConfirm,
    isMdfScope,
    isAllowedByLicense,
    isLicenseExpiring,
  }: {
    isRunningTab: boolean
    enabledByUser: boolean
    isTryConfirm: boolean
    isMdfScope: boolean
    isAllowedByLicense: boolean
    isLicenseExpiring: boolean
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
        enabledByUser,
        isBotProtected: false,
        isTryConfirm,
        isMdfScope,
        isAllowedByLicense,
        isLicenseExpiring,
      }],
    })
  } catch (error) {
    console.warn('[SW][Runner] scripting.executeScript failed', {
      tabId,
      isRunningTab,
      enabledByUser,
      isTryConfirm,
      isMdfScope,
      isAllowedByLicense,
      isLicenseExpiring,
      error,
    })
  }
}

function getRunnerTitleState(
  runner: RunnerRecord,
  {
    isRunningTab,
  }: {
    isRunningTab: boolean
  },
) {
  const tabContext = getTabContext(runner.tabId)
  const license = getLicenseState()

  return {
    isRunningTab,
    enabledByUser: getPlayerEnabledByUser(tabContext?.playerId),
    isTryConfirm: tabContext?.isTryConfirm === true,
    isMdfScope: runner.t !== null,
    isAllowedByLicense: license.allowedByLicense,
    isLicenseExpiring: license.status === 'warning',
  }
}

async function dispatchRunnerState(
  type: typeof START_MESSAGE_TYPE | typeof STOP_MESSAGE_TYPE,
  runner: RunnerRecord,
  {
    isRunningTab,
  }: {
    isRunningTab: boolean
  },
) {
  const titleState = getRunnerTitleState(runner, {
    isRunningTab,
  })

  await updateActiveTitle(runner.tabId, titleState)

  await sendRunnerMessage(
    runner.tabId,
    type,
    runner.scopeKey,
  )
}

export async function syncSelectedRunnerState(runner: RunnerRecord) {
  await dispatchRunnerState(
    canExecuteRunner(runner) ? START_MESSAGE_TYPE : STOP_MESSAGE_TYPE,
    runner,
    {
      isRunningTab: true,
    },
  )
}

export async function reconcileActiveRunner(reason = 'unknown') {
  await ensureRunnerTabsLoaded()
  await ensurePreparedContextLoaded()
  await ensureEnabledByUserLoaded()

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
    if (
      nextRunner
      && (
        reason === SET_ENABLED_BY_USER_MESSAGE_TYPE
        || reason === 'startup'
      )
    ) {
      await syncSelectedRunnerState(nextRunner)
    }

    await syncRunnerActions(previousRunner, nextRunner)

    return nextRunner
  }

  await syncRunnerByScope(nextRunner)

  const windowLock = getWindowLock()

  if (!nextRunner && previousRunner && windowLock?.windowId === previousRunner.windowId) {
    await syncWindowLock(toWindowLock(previousRunner))
  }

  if (nextRunner) {
    await syncWindowLock(toWindowLock(nextRunner))
  } else if (allowFallbackToOtherWindow) {
    await syncWindowLock(null)
  }

  if (previousRunner && previousRunner.tabId !== nextRunner?.tabId) {
    await dispatchRunnerState(STOP_MESSAGE_TYPE, previousRunner, {
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

  await reconcileActiveRunner('startup')
  await syncKnownTabActions()
}
