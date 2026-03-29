/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { createLicenseState } from '../../types'
import { syncTabAction } from '../action'
import { getPlayerEnabledByUser } from '../enabled-by-user'
import {
  getPreparedContextTabIds,
  getTabContext,
  getTabUrl,
  getWorldFromUrl,
  isTribalWarsUrl,
} from '../prepared-context'
import { getCurrentRunner, type RunnerRecord } from '../runner-tabs'

function getLicenseState() {
  return createLicenseState()
}

export async function syncTabActionByTabId(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return
  }

  let tab: chrome.tabs.Tab | null = null

  try {
    tab = await chrome.tabs.get(tabId)
  } catch {
    return
  }

  const tabUrl = getTabUrl(tab)
  const context = getTabContext(tabId)
  const currentRunner = getCurrentRunner()
  const urlParams = tabUrl ? getParamsUrl(tabUrl) : {}
  const enabled = isTribalWarsUrl(tabUrl)
  const enabledByUser = typeof context?.playerId === 'number'
    ? getPlayerEnabledByUser(context.playerId)
    : null
  const isActiveRunner = Boolean(
    enabled
    && currentRunner
    && currentRunner.tabId === tabId
    && currentRunner.windowId === tab?.windowId
  )

  await syncTabAction({
    tabId,
    enabled,
    enabledByUser,
    active: isActiveRunner,
    context: context?.context ?? null,
    world: context?.world ?? (isActiveRunner ? currentRunner?.world ?? null : getWorldFromUrl(tabUrl)),
    t: context?.t ?? (isActiveRunner ? currentRunner?.t ?? null : urlParams.t ?? null),
    playerName: context?.playerName ?? null,
    isTryConfirm: context?.isTryConfirm === true || urlParams.isTryConfirm === true,
    license: getLicenseState(),
  })
}

export async function syncRunnerActions(
  previousRunner: RunnerRecord | null,
  nextRunner: RunnerRecord | null,
) {
  const tabIds = new Set<number>()

  if (typeof previousRunner?.tabId === 'number') {
    tabIds.add(previousRunner.tabId)
  }

  if (typeof nextRunner?.tabId === 'number') {
    tabIds.add(nextRunner.tabId)
  }

  await Promise.all(
    Array.from(tabIds).map((tabId) => syncTabActionByTabId(tabId)),
  )
}

export async function syncKnownTabActions() {
  await Promise.all(
    getPreparedContextTabIds().map((tabId) => syncTabActionByTabId(tabId)),
  )
}
