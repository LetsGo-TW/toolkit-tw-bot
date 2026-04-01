/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { isAllowedOrigin } from '../message/origins'
import { normalizeBoolean, normalizeNumber, normalizeString } from '../normalize'

const TAB_CONTEXT_STORAGE_KEY = 'tabContextByTabId'

export type PreparedContextType = 'GAME' | 'LOGIN'

export type PreparedMessageData = {
  context?: unknown
  world?: unknown
  t?: unknown
  isTryConfirm?: unknown
  playerId?: unknown
  playerName?: unknown
}

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

let cacheLoaded = false
let tabContextByTabIdCache: TabContextByTabId = {}

function normalizePreparedContextType(value: unknown): PreparedContextType | null {
  return value === 'GAME' || value === 'LOGIN' ? value : null
}

function normalizeTabContextByTabId(value: unknown): TabContextByTabId {
  if (!value || typeof value !== 'object') {
    return {}
  }

  return value as TabContextByTabId
}

function shouldPersistTabContextRecord(record: TabContextRecord) {
  return isTribalWarsUrl(record.url)
}

function sanitizeTabContextByTabId(value: TabContextByTabId) {
  return Object.fromEntries(
    Object.entries(value).filter(([, record]) => shouldPersistTabContextRecord(record)),
  )
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

async function persistTabContextByTabId(
  previous: TabContextByTabId,
  next: TabContextByTabId,
) {
  await persistStateIfChanged(TAB_CONTEXT_STORAGE_KEY, previous, next)
}

export function getWorldFromUrl(urlString?: string | null) {
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

export function getTabUrl(tab?: chrome.tabs.Tab | null) {
  return tab?.pendingUrl || tab?.url || null
}

export function isTribalWarsUrl(urlString?: string | null) {
  if (!urlString) {
    return false
  }

  try {
    return isAllowedOrigin(new URL(urlString).origin)
  } catch {
    return false
  }
}

export function getScopeFromUrl(urlString?: string | null) {
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

export function getTabContextKey(tabId: number) {
  return String(tabId)
}

export async function ensurePreparedContextLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([TAB_CONTEXT_STORAGE_KEY])
  const normalizedCache = normalizeTabContextByTabId(stored[TAB_CONTEXT_STORAGE_KEY])
  const sanitizedCache = sanitizeTabContextByTabId(normalizedCache)

  tabContextByTabIdCache = sanitizedCache
  cacheLoaded = true

  await persistTabContextByTabId(normalizedCache, sanitizedCache)
}

export function getTabContext(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  return tabContextByTabIdCache[getTabContextKey(tabId)] || null
}

export function getTabIdsByPlayerId(playerId: number) {
  return Object.values(tabContextByTabIdCache)
    .filter((tabContext) => tabContext.playerId === playerId)
    .map((tabContext) => tabContext.tabId)
}

export function getPreparedContextTabIds() {
  return Object.keys(tabContextByTabIdCache)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
}

export function getPreparedContextScopeKeys() {
  return Array.from(
    new Set(
      Object.values(tabContextByTabIdCache)
        .map((tabContext) => tabContext.scopeKey)
        .filter((scopeKey): scopeKey is string => typeof scopeKey === 'string' && scopeKey.length > 0),
    ),
  )
}

export function getScopeFromTabContext(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  const tabContext = tabContextByTabIdCache[getTabContextKey(tabId)]

  if (!tabContext?.world || !isTribalWarsUrl(tabContext.url)) {
    return null
  }

  return {
    world: tabContext.world,
    t: tabContext.t ?? null,
    scopeKey: `${tabContext.world}:${tabContext.t ?? 'main'}`,
  }
}

export function getScopeForTab(tab?: chrome.tabs.Tab | null) {
  if (!tab) {
    return null
  }

  const tabUrl = getTabUrl(tab)
  const urlScope = getScopeFromUrl(tabUrl)

  if (urlScope) {
    return urlScope
  }

  return getScopeFromTabContext(tab.id)
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

  if (!isTribalWarsUrl(sender.tab?.url)) {
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

export async function upsertPreparedContext(
  sender: chrome.runtime.MessageSender,
  data: PreparedMessageData,
) {
  await ensurePreparedContextLoaded()

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

export async function updatePreparedContextFromUrl(
  tabId: number,
  nextUrl: string,
) {
  await ensurePreparedContextLoaded()

  const previousRecord = tabContextByTabIdCache[getTabContextKey(tabId)] || null
  const isTwUrl = isTribalWarsUrl(nextUrl)

  if (!isTwUrl) {
    if (!previousRecord) {
      return null
    }

    const previousCache = tabContextByTabIdCache
    const nextCache = { ...previousCache }

    delete nextCache[getTabContextKey(tabId)]

    tabContextByTabIdCache = nextCache
    await persistTabContextByTabId(previousCache, nextCache)

    return null
  }

  const urlParams = getParamsUrl(nextUrl)
  const nextWorld = getWorldFromUrl(nextUrl)
  const nextContext = (
    urlParams.isInLogin
      ? 'LOGIN'
      : urlParams.isInGame
        ? previousRecord?.context ?? null
        : null
  )
  const nextRecord = previousRecord
    ? {
      ...previousRecord,
      url: nextUrl,
      context: nextContext,
      world: urlParams.isInGame ? previousRecord.world : nextWorld,
      t: urlParams.isInGame ? previousRecord.t : null,
      scopeKey: urlParams.isInGame
        ? previousRecord.scopeKey
        : null,
      playerId: urlParams.isInGame ? previousRecord.playerId : null,
      playerName: urlParams.isInGame ? previousRecord.playerName : null,
      isTryConfirm: urlParams.isTryConfirm === true,
      updatedAt: new Date().toISOString(),
    }
    : {
      tabId,
      windowId: -1,
      url: nextUrl,
      context: nextContext,
      world: nextWorld,
      t: null,
      isTryConfirm: urlParams.isTryConfirm === true,
      scopeKey: null,
      playerId: null,
      playerName: null,
      updatedAt: new Date().toISOString(),
    }

  if (!previousRecord) {
    try {
      const tab = await chrome.tabs.get(tabId)

      if (typeof tab.windowId === 'number') {
        nextRecord.windowId = tab.windowId
      }
    } catch {
      // ignore stale tab lookups while updating cache
    }
  }

  const previousCache = tabContextByTabIdCache
  const nextCache = {
    ...previousCache,
    [getTabContextKey(tabId)]: nextRecord,
  }

  tabContextByTabIdCache = nextCache
  await persistTabContextByTabId(previousCache, nextCache)

  return nextRecord
}

export async function syncPreparedContextWithOpenTwTabs() {
  await ensurePreparedContextLoaded()

  const hostPermissions = chrome.runtime.getManifest().host_permissions || []

  if (!hostPermissions.length) {
    return tabContextByTabIdCache
  }

  const openTwTabs = await chrome.tabs.query({
    url: hostPermissions,
  })
  const openTwTabsById = new Map<number, chrome.tabs.Tab>()

  for (const tab of openTwTabs) {
    if (typeof tab.id === 'number') {
      openTwTabsById.set(tab.id, tab)
    }
  }

  const nextCache = Object.fromEntries(
    Object.values(tabContextByTabIdCache)
      .flatMap((record) => {
        const tab = openTwTabsById.get(record.tabId)

        if (!tab) {
          return []
        }

        const nextUrl = getTabUrl(tab)

        if (!isTribalWarsUrl(nextUrl)) {
          return []
        }

        return [[
          getTabContextKey(record.tabId),
          {
            ...record,
            windowId: typeof tab.windowId === 'number' ? tab.windowId : record.windowId,
            url: nextUrl,
          },
        ] satisfies [string, TabContextRecord]]
      }),
  ) as TabContextByTabId

  const previousCache = tabContextByTabIdCache
  tabContextByTabIdCache = nextCache
  await persistTabContextByTabId(previousCache, nextCache)

  return nextCache
}

export async function removePreparedContext(tabId?: number) {
  await ensurePreparedContextLoaded()

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

export async function syncPreparedContextWindowId(
  tabId: number,
  windowId: number,
) {
  await ensurePreparedContextLoaded()

  const tabContextKey = getTabContextKey(tabId)
  const previousRecord = tabContextByTabIdCache[tabContextKey]

  if (!previousRecord) {
    return
  }

  const previousCache = tabContextByTabIdCache
  const nextCache = {
    ...previousCache,
    [tabContextKey]: {
      ...previousRecord,
      windowId,
    },
  }

  tabContextByTabIdCache = nextCache
  await persistTabContextByTabId(previousCache, nextCache)
}
