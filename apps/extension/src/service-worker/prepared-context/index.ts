/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import type { FeaturesMap } from '../../types'
import { isAllowedOrigin } from '../message/origins'
import { normalizeBoolean, normalizeNumber, normalizeString } from '../normalize'

const TAB_CONTEXT_STORAGE_KEY = 'tabContextByTabId'

export type PreparedContextType = 'GAME' | 'LOGIN'

export type PreparedMessageData = {
  context?: unknown
  world?: unknown
  t?: unknown
  isTryConfirm?: unknown
  isBotProtected?: unknown
  playerId?: unknown
  playerName?: unknown
  features?: unknown
  points?: unknown
  rank?: unknown
  villages?: unknown
  dateStarted?: unknown
  date_started?: unknown
}

export type TabContextRecord = {
  tabId: number
  windowId: number
  url: string | null
  context: PreparedContextType | null
  world: string | null
  t: number | null
  isTryConfirm: boolean
  isBotProtected: boolean
  scopeKey: string | null
  playerId: number | null
  playerName: string | null
  features: FeaturesMap | null
  points: number | null
  rank: number | null
  villages: number | null
  dateStarted: number | null
  updatedAt: string
}

type TabContextByTabId = Record<string, TabContextRecord>

let cacheLoaded = false
let tabContextByTabIdCache: TabContextByTabId = {}

function normalizeFeatureToggle(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<{ possible: unknown; active: unknown }>

  if (
    typeof candidate.possible !== 'boolean'
    || typeof candidate.active !== 'boolean'
  ) {
    return null
  }

  return {
    possible: candidate.possible,
    active: candidate.active,
  }
}

function normalizeFeaturesMap(value: unknown): FeaturesMap | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, feature]) => {
      const normalizedFeature = normalizeFeatureToggle(feature)

      return normalizedFeature ? [key, normalizedFeature] as const : null
    })
    .filter((entry): entry is readonly [string, { possible: boolean; active: boolean }] => entry !== null)

  if (!entries.length) {
    return null
  }

  return Object.fromEntries(entries)
}

function normalizeNumberish(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

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

async function persistTabContextByTabId(
  _previous: TabContextByTabId,
  _next: TabContextByTabId,
) {
  return
}

export function getWorldFromUrl(urlString?: string | null) {
  if (!urlString) {
    return null
  }

  try {
    const url = new URL(urlString)
    const worldFromPortalPath = url.pathname.match(/^\/page\/play\/([^/?#]+)/)?.[1] || null
    const world = url.hostname.split('.')[0] || worldFromPortalPath || null

    return world === 'www' ? worldFromPortalPath : world
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

function getHostPermissionUrls() {
  return chrome.runtime.getManifest().host_permissions || []
}

async function queryOpenTwTabs() {
  const hostPermissions = getHostPermissionUrls()

  if (!hostPermissions.length) {
    return []
  }

  return chrome.tabs.query({
    url: hostPermissions,
  })
}

export async function getOpenTwTabIds() {
  const tabs = await queryOpenTwTabs()

  return tabs
    .map((tab) => tab.id)
    .filter((tabId): tabId is number => typeof tabId === 'number')
}

function createTabContextSeedFromTab(
  tab: chrome.tabs.Tab,
  previousRecord?: TabContextRecord | null,
): TabContextRecord | null {
  if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') {
    return null
  }

  const url = getTabUrl(tab)

  if (!url || !isTribalWarsUrl(url)) {
    return null
  }

  const urlParams = getParamsUrl(url)
  const urlScope = getScopeFromUrl(url)
  const worldFromUrl = getWorldFromUrl(url)

  return {
    tabId: tab.id,
    windowId: tab.windowId,
    url,
    context: urlParams.isInLogin
      ? 'LOGIN'
      : urlParams.isInGame
        ? 'GAME'
        : null,
    world: urlParams.isInLogin
      ? previousRecord?.world ?? worldFromUrl
      : urlScope?.world ?? worldFromUrl,
    t: urlParams.isInLogin
      ? previousRecord?.t ?? null
      : urlScope?.t ?? null,
    isTryConfirm: urlParams.isTryConfirm === true,
    isBotProtected: false,
    scopeKey: urlParams.isInLogin
      ? previousRecord?.scopeKey ?? null
      : urlScope?.scopeKey ?? null,
    playerId: previousRecord?.playerId ?? null,
    playerName: previousRecord?.playerName ?? null,
    features: null,
    points: null,
    rank: null,
    villages: null,
    dateStarted: null,
    updatedAt: new Date().toISOString(),
  }
}

async function createPreparedContextCacheFromOpenTwTabs(
  previousCache: TabContextByTabId,
) {
  const openTwTabs = await queryOpenTwTabs()

  return Object.fromEntries(
    openTwTabs
      .map((tab) => {
        const nextRecord = createTabContextSeedFromTab(
          tab,
          previousCache[typeof tab.id === 'number' ? getTabContextKey(tab.id) : ''] || null,
        )

        return nextRecord
          ? [getTabContextKey(nextRecord.tabId), nextRecord] as const
          : null
      })
      .filter((entry): entry is readonly [string, TabContextRecord] => entry !== null),
  ) as TabContextByTabId
}

export async function ensurePreparedContextLoaded() {
  if (cacheLoaded) {
    return
  }

  const stored = await chrome.storage.local.get([TAB_CONTEXT_STORAGE_KEY])
  const normalizedCache = normalizeTabContextByTabId(stored[TAB_CONTEXT_STORAGE_KEY])
  const sanitizedCache = sanitizeTabContextByTabId(normalizedCache)
  const liveCache = await createPreparedContextCacheFromOpenTwTabs(sanitizedCache)

  tabContextByTabIdCache = liveCache
  cacheLoaded = true

  if (stored[TAB_CONTEXT_STORAGE_KEY] !== undefined) {
    await chrome.storage.local.remove(TAB_CONTEXT_STORAGE_KEY)
  }
}

export function getTabContext(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  return tabContextByTabIdCache[getTabContextKey(tabId)] || null
}

export function getTabIdsByWorldPlayer(world: string, playerId: number) {
  return Object.values(tabContextByTabIdCache)
    .filter((tabContext) => tabContext.world === world && tabContext.playerId === playerId)
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

export function getTabContextsByScopeKey(scopeKey?: string | null) {
  if (!scopeKey) {
    return []
  }

  return Object.values(tabContextByTabIdCache)
    .filter((tabContext) => tabContext.scopeKey === scopeKey)
}

export function getScopeFromTabContext(tabId?: number | null) {
  if (typeof tabId !== 'number') {
    return null
  }

  const tabContext = tabContextByTabIdCache[getTabContextKey(tabId)]

  if (typeof tabContext?.scopeKey === 'string' && tabContext.scopeKey.length > 0) {
    const [world, tValue] = tabContext.scopeKey.split(':')

    if (!world) {
      return null
    }

    const t = tValue === 'main' || typeof tValue !== 'string'
      ? null
      : normalizeNumber(tValue)

    return {
      world,
      t,
      scopeKey: tabContext.scopeKey,
    }
  }

  return null
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
  const hasPreparedIsBotProtected = Object.prototype.hasOwnProperty.call(data, 'isBotProtected')
  const preparedIsBotProtected = normalizeBoolean(data.isBotProtected)
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
    isBotProtected: hasPreparedIsBotProtected
      ? preparedIsBotProtected
      : previousRecord?.isBotProtected === true,
    scopeKey: nextScopeKey,
    playerId: normalizeNumber(data.playerId) ?? previousRecord?.playerId ?? null,
    playerName: normalizeString(data.playerName) ?? previousRecord?.playerName ?? null,
    features: normalizeFeaturesMap(data.features) ?? previousRecord?.features ?? null,
    points: normalizeNumberish(data.points) ?? previousRecord?.points ?? null,
    rank: normalizeNumberish(data.rank) ?? previousRecord?.rank ?? null,
    villages: normalizeNumberish(data.villages) ?? previousRecord?.villages ?? null,
    dateStarted: normalizeNumberish(data.dateStarted ?? data.date_started) ?? previousRecord?.dateStarted ?? null,
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
  const nextUrlScope = getScopeFromUrl(nextUrl)
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
      world: urlParams.isInLogin
        ? previousRecord.world
        : urlParams.isInGame
          ? nextUrlScope?.world ?? nextWorld
          : nextWorld,
      t: urlParams.isInLogin
        ? previousRecord.t
        : urlParams.isInGame
          ? nextUrlScope?.t ?? null
          : null,
      scopeKey: urlParams.isInLogin
        ? previousRecord.scopeKey
        : urlParams.isInGame
          ? nextUrlScope?.scopeKey ?? null
          : null,
      playerId: urlParams.isInLogin
        ? previousRecord.playerId
        : urlParams.isInGame
          ? previousRecord.playerId
          : null,
      playerName: urlParams.isInLogin
        ? previousRecord.playerName
        : urlParams.isInGame
          ? previousRecord.playerName
          : null,
      features: null,
      points: null,
      rank: null,
      villages: null,
      dateStarted: null,
      isTryConfirm: previousRecord.isTryConfirm,
      isBotProtected: false,
      updatedAt: new Date().toISOString(),
    }
    : {
      tabId,
      windowId: -1,
      url: nextUrl,
      context: nextContext,
      world: nextWorld,
      t: null,
      isTryConfirm: false,
      isBotProtected: false,
      scopeKey: null,
      playerId: null,
      playerName: null,
      features: null,
      points: null,
      rank: null,
      villages: null,
      dateStarted: null,
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
  const nextCache = await createPreparedContextCacheFromOpenTwTabs(tabContextByTabIdCache)

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
