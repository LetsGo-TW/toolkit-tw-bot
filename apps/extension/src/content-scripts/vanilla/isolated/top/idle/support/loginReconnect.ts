/// <reference types="chrome" />

import { getParamsUrl } from '@toolkit-tw-bot/core'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { LOGIN_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'
import { setActiveTitle } from '../../../../shared/setActiveTitle'

const LOGIN_RECONNECT_HINT_ID = 'toolkit-tw-bot-login-reconnect-hint'
const LOGIN_RECONNECT_LOG_STORAGE_KEY = 'toolkitTwBotLoginReconnectLog'
const LOGIN_RECONNECT_LOG_MAX_ENTRIES = 50
const LOGIN_RECONNECT_WRAP_SELECTOR = '#home > div.center > div.content.box-border.red > div.inner > div.right.login > div.wrap'

let reconnectTimerId: number | null = null

type LoginReconnectResponse = {
  ok?: boolean
  canReconnect?: boolean
  world?: string | null
  playerId?: number | null
  reconnectUrl?: string | null
  reconnectAt?: number | null
  reconnectReason?: string | null
  enabledByUser?: boolean
  reconnectOnSessionExpired?: boolean
  isAllowedByLicense?: boolean
  shouldCloseTab?: boolean
  data?: Record<string, unknown>
}

type LoginReconnectLogEntry = {
  timestamp: number
  world: string | null
  playerId: number | null
  reason: string | null
  reconnectAt: number | null
}

type LoginReconnectHintTone = 'success' | 'danger' | 'warn'

function isReconnectable(doc: Document = document) {
  return !doc.querySelector('#user')
}

function getLoginReconnectWrap(doc: Document = document) {
  const element = doc.querySelector(LOGIN_RECONNECT_WRAP_SELECTOR)

  return element instanceof HTMLElement
    ? element
    : null
}

function getOrCreateLoginReconnectHint(doc: Document = document) {
  const existing = doc.getElementById(LOGIN_RECONNECT_HINT_ID)

  if (existing instanceof HTMLParagraphElement) {
    return existing
  }

  const wrap = getLoginReconnectWrap(doc)

  if (!wrap) {
    return null
  }

  const hint = doc.createElement('p')
  hint.id = LOGIN_RECONNECT_HINT_ID
  hint.style.marginTop = '0.65rem'
  hint.style.display = 'flex'
  hint.style.alignItems = 'center'
  hint.style.gap = '0.45rem'
  hint.style.minHeight = '3rem'
  hint.style.fontSize = '0.8rem'
  hint.style.lineHeight = '1.35'
  wrap.appendChild(hint)

  return hint
}

function getLoginReconnectIconUrl(tone: LoginReconnectHintTone) {
  switch (tone) {
    case 'danger':
      return chrome.runtime.getURL('icons/ico.red.48.png')
    case 'warn':
      return chrome.runtime.getURL('icons/ico.yellow-black.48.png')
    default:
      return chrome.runtime.getURL('icons/ico.green.48.png')
  }
}

function getLoginReconnectHintColor(tone: LoginReconnectHintTone) {
  switch (tone) {
    case 'danger':
      return '#d61e1e'
    case 'warn':
      return '#9f530a'
    default:
      return '#29512b'
  }
}

function setLoginReconnectHint(
  text: string,
  tone: LoginReconnectHintTone,
  doc: Document = document,
) {
  const hint = getOrCreateLoginReconnectHint(doc)

  if (!hint) {
    return
  }

  hint.replaceChildren()
  hint.style.color = getLoginReconnectHintColor(tone)

  const icon = doc.createElement('img')
  icon.src = getLoginReconnectIconUrl(tone)
  icon.alt = ''
  icon.width = 24
  icon.height = 24
  icon.style.width = '1.5rem'
  icon.style.height = '1.5rem'
  icon.style.flexShrink = '0'

  const label = doc.createElement('span')
  label.textContent = text

  hint.append(icon, label)
}

function getReconnectReasonLabel(reason?: string | null) {
  switch (reason) {
    case 'short-break':
      return 'short break'
    case 'long-rest':
      return 'long rest'
    case 'session-expired':
      return 'session expired'
    default:
      return 'reconnect'
  }
}

function formatReconnectTime(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--:--'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function getReconnectWorldFromUrl(url?: string | null) {
  if (typeof url !== 'string' || !url.trim()) {
    return null
  }

  try {
    const parsedUrl = new URL(url)
    const worldFromPath = parsedUrl.pathname.match(/^\/page\/play\/([^/?#]+)/)?.[1] || null

    if (worldFromPath) {
      return worldFromPath
    }

    const hostParts = parsedUrl.hostname.split('.')
    const firstHostPart = hostParts[0] || null

    if (!firstHostPart || firstHostPart === 'www' || firstHostPart === 'tribalwars') {
      return null
    }

    return firstHostPart
  } catch {
    return null
  }
}

function formatReconnectWorldLabel(value?: string | null) {
  const normalizedWorld = typeof value === 'string' && value.trim()
    ? value.trim()
    : null

  if (!normalizedWorld) {
    return null
  }

  return `mundo: ${normalizedWorld}.`
}

function isSameReconnectTarget(url?: string | null, currentHref = window.location.href) {
  if (typeof url !== 'string' || !url.trim()) {
    return false
  }

  try {
    const targetUrl = new URL(url)
    const currentUrl = new URL(currentHref)

    return targetUrl.origin === currentUrl.origin
      && targetUrl.pathname === currentUrl.pathname
      && targetUrl.search === currentUrl.search
  } catch {
    return false
  }
}

function clearReconnectTimer() {
  if (reconnectTimerId !== null) {
    window.clearTimeout(reconnectTimerId)
    reconnectTimerId = null
  }
}

function normalizeLoginReconnectLogEntry(value: unknown): LoginReconnectLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const source = value as Partial<LoginReconnectLogEntry>
  const timestamp = Number(source.timestamp)
  const playerId = typeof source.playerId === 'number' && Number.isFinite(source.playerId)
    ? source.playerId
    : null
  const reconnectAt = typeof source.reconnectAt === 'number' && Number.isFinite(source.reconnectAt)
    ? source.reconnectAt
    : null
  const world = typeof source.world === 'string' && source.world.trim()
    ? source.world.trim()
    : null
  const reason = typeof source.reason === 'string' && source.reason.trim()
    ? source.reason.trim()
    : null

  if (!Number.isFinite(timestamp)) {
    return null
  }

  return {
    timestamp,
    world,
    playerId,
    reason,
    reconnectAt,
  }
}

function readLoginReconnectLog() {
  try {
    const raw = window.localStorage.getItem(LOGIN_RECONNECT_LOG_STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .map((entry) => normalizeLoginReconnectLogEntry(entry))
      .filter((entry): entry is LoginReconnectLogEntry => entry !== null)
  } catch {
    return []
  }
}

function appendLoginReconnectLogEntry(entry: LoginReconnectLogEntry) {
  try {
    const entries = readLoginReconnectLog()

    const alreadyExists = entries.some((existingEntry) => (
      existingEntry.world === entry.world
      && existingEntry.playerId === entry.playerId
      && existingEntry.reason === entry.reason
      && existingEntry.reconnectAt === entry.reconnectAt
    ))

    if (alreadyExists) {
      return
    }

    const nextEntries = [...entries, entry].slice(-LOGIN_RECONNECT_LOG_MAX_ENTRIES)

    window.localStorage.setItem(
      LOGIN_RECONNECT_LOG_STORAGE_KEY,
      JSON.stringify(nextEntries),
    )
  } catch {
    // Ignore storage write failures in restricted or private contexts.
  }
}

export async function maybeHandleLoginReconnect() {
  clearReconnectTimer()

  const runtimeParams = getParamsUrl(
    window.location.href,
    window.location.origin,
  )

  if (!runtimeParams.isInLogin) {
    return false
  }

  const response = await chrome.runtime.sendMessage({
    extensionId: RELEASE_EXTENSION_ID,
    type: LOGIN_MESSAGE_TYPE,
    isReconnectable: isReconnectable(),
  }) as LoginReconnectResponse

  if (response?.data) {
    setActiveTitle(response.data)
  }

  const reconnectReason = typeof response?.reconnectReason === 'string'
    ? response.reconnectReason
    : null
  const reconnectAt = typeof response?.reconnectAt === 'number'
    ? response.reconnectAt
    : null
  const reconnectWorld = (
    typeof response?.world === 'string' && response.world.trim()
      ? response.world.trim()
      : getReconnectWorldFromUrl(response?.reconnectUrl)
  )
  const hasSessionExpiredParam = Boolean(runtimeParams.sessionExpired)
  const isManagedReconnect = (
    hasSessionExpiredParam
    || reconnectReason === 'session-expired'
    || reconnectReason === 'short-break'
    || reconnectReason === 'long-rest'
  )

  if (!isManagedReconnect) {
    // TODO: notify the user when the tab reaches a plain login state outside managed reconnect.
    return false
  }

  if (response?.shouldCloseTab === true) {
    return true
  }

  if (!response?.ok) {
    setLoginReconnectHint('reconnect desabilitado.', 'warn')
    return true
  }

  if (response.isAllowedByLicense !== true) {
    setLoginReconnectHint('sem licença para reconnectar.', 'danger')
    return true
  }

  if (!response.canReconnect || !response.reconnectUrl) {
    setLoginReconnectHint('reconnect desabilitado.', 'warn')
    return true
  }

  if (
    runtimeParams.isPortalPage
    && isSameReconnectTarget(response.reconnectUrl)
  ) {
    setLoginReconnectHint(
      [
        'aguarde o carregamento do mundo.',
        formatReconnectWorldLabel(reconnectWorld),
        `motivo: ${getReconnectReasonLabel(reconnectReason)}.`,
        `horário: ${formatReconnectTime(reconnectAt)}.`,
      ]
        .filter(Boolean)
        .join(' '),
      'success',
    )

    return true
  }

  appendLoginReconnectLogEntry({
    timestamp: Date.now(),
    world: typeof response.world === 'string' && response.world.trim()
      ? response.world.trim()
      : null,
    playerId: typeof response.playerId === 'number' && Number.isFinite(response.playerId)
      ? response.playerId
      : null,
    reason: reconnectReason,
    reconnectAt,
  })

  setLoginReconnectHint(
    [
      'aguarde para reconnectar.',
      formatReconnectWorldLabel(reconnectWorld),
      `motivo: ${getReconnectReasonLabel(reconnectReason)}.`,
      `horário: ${formatReconnectTime(reconnectAt)}.`,
    ]
      .filter(Boolean)
      .join(' '),
    'success',
  )

  reconnectTimerId = window.setTimeout(() => {
    reconnectTimerId = null
    window.location.assign(response.reconnectUrl as string)
  }, Math.max(0, (reconnectAt ?? Date.now()) - Date.now()))

  return true
}
