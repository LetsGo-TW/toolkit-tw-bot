import { normalizeNumber, normalizeString } from '../../normalize'
import { requestNotifyApiJson } from '../api'

const TELEGRAM_LINK_CACHE_SAFETY_MS = 30 * 1000

type TelegramSubscription = {
  chatId: string | null
  id: string | null
  linkedAt: string | null
  status: string | null
  username: string | null
}

type TelegramLink = {
  appUrl: string | null
  command: string | null
  expiresAt: string | null
  qrCodeDataUrl: string | null
  token: string | null
  ttlSeconds: number | null
  url: string
}

type TelegramStateRecord = {
  link: TelegramLink | null
  linkLoadedAt: number | null
  statusLoadedAt: number | null
  subscriptions: TelegramSubscription[]
}

const telegramStateByKey = new Map<string, TelegramStateRecord>()

function getTelegramStateKey(world: string, playerId: number) {
  return `${world}:${playerId}`
}

function createEmptyTelegramStateRecord(): TelegramStateRecord {
  return {
    link: null,
    linkLoadedAt: null,
    statusLoadedAt: null,
    subscriptions: [],
  }
}

function normalizeTelegramLink(raw: unknown): TelegramLink | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const candidate = raw as Record<string, unknown>
  const url = normalizeString(candidate.url)

  if (!url) {
    return null
  }

  return {
    url,
    appUrl: normalizeString(candidate.appUrl ?? candidate.url) ?? url,
    command: normalizeString(candidate.command),
    token: normalizeString(candidate.token),
    ttlSeconds: normalizeNumber(candidate.ttlSeconds),
    expiresAt: normalizeString(candidate.expiresAt),
    qrCodeDataUrl: normalizeString(candidate.qrCodeDataUrl),
  }
}

function normalizeTelegramSubscriptions(raw: unknown): TelegramSubscription[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.map((item) => {
    const candidate = item && typeof item === 'object'
      ? item as Record<string, unknown>
      : {}

    return {
      id: normalizeString(candidate.id),
      chatId: normalizeString(candidate.chatId),
      username: normalizeString(candidate.username),
      status: normalizeString(candidate.status),
      linkedAt: normalizeString(candidate.linkedAt),
    }
  })
}

function isTelegramLinkFresh(link: TelegramLink | null) {
  if (!link?.expiresAt) {
    return false
  }

  const expiresAt = new Date(link.expiresAt).getTime()

  if (!Number.isFinite(expiresAt)) {
    return false
  }

  return expiresAt - TELEGRAM_LINK_CACHE_SAFETY_MS > Date.now()
}

function getTelegramLinkIssuedAtMs(link: TelegramLink | null) {
  const ttlSeconds = Number(link?.ttlSeconds)
  const expiresAtMs = new Date(link?.expiresAt || '').getTime()

  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return 0
  }

  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) {
    return 0
  }

  return expiresAtMs - (ttlSeconds * 1000)
}

function getLatestTelegramLinkedAtMs(subscriptions: TelegramSubscription[] = []) {
  return subscriptions
    .filter((item) => item?.status === 'active')
    .reduce((latestMs, item) => {
      const linkedAtMs = new Date(item?.linkedAt || '').getTime()

      return Number.isFinite(linkedAtMs) && linkedAtMs > latestMs
        ? linkedAtMs
        : latestMs
    }, 0)
}

function isTelegramLinkConsumedBySubscriptions(
  link: TelegramLink | null,
  subscriptions: TelegramSubscription[] = [],
) {
  const issuedAtMs = getTelegramLinkIssuedAtMs(link)
  const latestLinkedAtMs = getLatestTelegramLinkedAtMs(subscriptions)

  if (!issuedAtMs || !latestLinkedAtMs) {
    return false
  }

  return latestLinkedAtMs >= issuedAtMs
}

async function fetchTelegramStatus(world: string, playerId: number) {
  const payload = await requestNotifyApiJson({
    pathname: '/auth/telegram/status',
    playerId,
    world,
  })

  return normalizeTelegramSubscriptions(payload?.subscriptions)
}

async function fetchTelegramLink(world: string, playerId: number) {
  const payload = await requestNotifyApiJson({
    pathname: '/auth/telegram/link',
    playerId,
    world,
  })

  return normalizeTelegramLink(payload)
}

function getOrCreateTelegramState(world: string, playerId: number) {
  const key = getTelegramStateKey(world, playerId)
  const cached = telegramStateByKey.get(key)

  if (cached) {
    return cached
  }

  const next = createEmptyTelegramStateRecord()
  telegramStateByKey.set(key, next)
  return next
}

export async function getTelegramState({
  forceLink = false,
  forceStatus = false,
  playerId,
  world,
}: {
  forceLink?: boolean
  forceStatus?: boolean
  playerId: number
  world: string
}) {
  const state = getOrCreateTelegramState(world, playerId)

  if (forceStatus || !state.statusLoadedAt) {
    state.subscriptions = await fetchTelegramStatus(world, playerId)
    state.statusLoadedAt = Date.now()
  }

  if (forceLink || !isTelegramLinkFresh(state.link)) {
    state.link = await fetchTelegramLink(world, playerId)
    state.linkLoadedAt = Date.now()
  }

  if (state.link && isTelegramLinkConsumedBySubscriptions(state.link, state.subscriptions)) {
    state.link = await fetchTelegramLink(world, playerId)
    state.linkLoadedAt = Date.now()
  }

  telegramStateByKey.set(getTelegramStateKey(world, playerId), state)

  return {
    link: state.link,
    subscriptions: state.subscriptions,
  }
}

export async function sendTelegramMessage({
  message,
  playerId,
  world,
}: {
  message: string
  playerId: number
  world: string
}) {
  const payload = await requestNotifyApiJson({
    body: {
      message,
      playerId,
    },
    method: 'POST',
    pathname: '/auth/telegram/notify',
    playerId,
    world,
  })
  const sentCount = normalizeNumber(payload?.sentCount) ?? 0

  return {
    sent: sentCount > 0,
    sentCount,
  }
}
