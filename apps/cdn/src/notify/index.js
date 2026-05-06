import "./style.css"
import notifyHtml from "./index.html"
import { v4 as uuidv4 } from "uuid"
import { extensionId as RELEASE_EXTENSION_ID } from "@toolkit-tw-bot/release"
import { printMessage } from "../components/printMessage"
import { getGameData } from "@toolkit-tw-bot/document"
import { useGoTiming } from "../hooks/useGoTiming"
import StorageLocalCompat from "../shared/indexdb/storage-local-compat.js"

const LEGACY_STORAGE_PREFIX = "GO-Notify-"
const STORAGE_PATH = ["notify", "state"]
const APP_TELEGRAM = "telegram"
const APP_NOTIFY = "notify"
const NOTIFY_MESSAGE_TYPE = "NOTIFY"
const TELEGRAM_LINK_CACHE_SAFETY_MS = 30 * 1000
const TELEGRAM_REFRESH_QR_COOLDOWN_MS = 30 * 1000
const TELEGRAM_BOT_USERNAME = "LetsGONotifyBot"
const DEFAULT_NOTIFY_BOT_AVATAR_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/ico.green.128.png`
const TELEGRAM_BOT_AVATAR_FALLBACK = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="92" height="92" viewBox="0 0 92 92">
    <defs>
      <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#f6e6bf"/>
        <stop offset="100%" stop-color="#edd7a6"/>
      </linearGradient>
    </defs>
    <rect width="92" height="92" rx="16" fill="url(#g)" stroke="#d3b173"/>
    <text x="46" y="52" text-anchor="middle" font-size="24" font-family="Verdana, Arial, sans-serif" font-weight="700" fill="#7a4208">BOT</text>
  </svg>
`)}`;

const CHANNELS = {
  hCaptcha: {
    label: "hCaptcha",
    title: "hCaptcha",
  },
  incoming: {
    label: "Ataques chegando",
    title: "Ataques chegando",
  },
}

const notifyRuntime = {
  node: null,
  sectionApi: null,
  playerId: null,
  storage: null,
  config: null,
  telegram: createTelegramUiState(),
  telegramRefreshTickUnsub: null,
}

const notifyStorageByComposeKey = new Map()

function createTelegramUiState() {
  return {
    loading: false,
    loaded: false,
    error: "",
    subscriptions: [],
    link: null,
    refreshCooldownUntilMs: 0,
  }
}

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function escapeAttr(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;")
}

function registerNotifyStorageInspector(playerId) {
  if (typeof window === "undefined") return

  window.goInspectNotifyStorage = async () => {
    const legacyKey = `${LEGACY_STORAGE_PREFIX}${playerId}`
    const compose = getNotifyStorageCompose(playerId)
    const storage = getNotifyStorage(playerId)
    let current = null

    try {
      current = await storage?.get?.() ?? null
    } catch (error) {
      current = {
        error: error?.message || String(error || ""),
      }
    }

    return {
      current: {
        compose,
        data: current,
      },
      legacy: {
        key: legacyKey,
        raw: localStorage.getItem(legacyKey),
      },
    }
  }
}

function normalizeApp(value = null) {
  const app = String(value || "").trim().toLowerCase()
  return app === APP_NOTIFY ? APP_NOTIFY : app === APP_TELEGRAM ? APP_TELEGRAM : null
}

function normalizeSent(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function normalizeCooldownUntilMs(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function buildDefaultEntry(channelKey) {
  return {
    active: false,
    app: APP_TELEGRAM,
    topic: uuidv4(),
    sent: 0,
  }
}

function normalizeNotifyEntry(channelKey, raw = {}) {
  const fallback = buildDefaultEntry(channelKey)
  const topic = String(raw?.topic || raw?.teme || raw?.tema || "").trim()
  const app = normalizeApp(raw?.app) || (raw?.active ? APP_NOTIFY : APP_TELEGRAM)

  return {
    active: Boolean(raw?.active),
    app,
    topic: topic || fallback.topic,
    sent: normalizeSent(raw?.sent),
  }
}

function normalizeNotifyConfig(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {}

  return {
    hCaptcha: normalizeNotifyEntry("hCaptcha", source.hCaptcha),
    incoming: normalizeNotifyEntry("incoming", source.incoming),
  }
}

function normalizeTelegramLink(raw = null) {
  if (!raw || typeof raw !== "object") return null

  const url = String(raw?.url || "").trim()
  if (!url) return null

  const link = {
    url,
    appUrl: String(raw?.appUrl || raw?.url || "").trim() || url,
    command: String(raw?.command || "").trim() || null,
    token: String(raw?.token || "").trim() || null,
    ttlSeconds: Number.isFinite(Number(raw?.ttlSeconds)) ? Number(raw.ttlSeconds) : null,
    expiresAt: String(raw?.expiresAt || "").trim() || null,
    qrCodeDataUrl: String(raw?.qrCodeDataUrl || "").trim() || null,
  }

  return isTelegramLinkFresh(link) ? link : null
}

function getTelegramNowMsSafe() {
  try {
    const nowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())
    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  return Date.now()
}

function getTelegramRefreshCooldownRemainingMs(untilMs = 0, nowMs = getTelegramNowMsSafe()) {
  const endMs = normalizeCooldownUntilMs(untilMs)
  if (!endMs) return 0
  return Math.max(0, endMs - nowMs)
}

function normalizeNotifyStorage(raw = {}) {
  const source = raw && typeof raw === "object" ? raw : {}
  const configSource = source?.config && typeof source.config === "object"
    ? source.config
    : source
  const telegramSource = source?.telegram && typeof source.telegram === "object"
    ? source.telegram
    : {}

  return {
    config: normalizeNotifyConfig(configSource),
    telegram: {
      link: normalizeTelegramLink(telegramSource.link),
      refreshCooldownUntilMs: getTelegramRefreshCooldownRemainingMs(telegramSource.refreshCooldownUntilMs) > 0
        ? normalizeCooldownUntilMs(telegramSource.refreshCooldownUntilMs)
        : 0,
    },
  }
}

function resolveCurrentPlayerId() {
  const gameData = getGameData()
  const playerId = Number(gameData?.player?.id || 0)
  notifyRuntime.playerId = Number.isInteger(playerId) && playerId > 0 ? playerId : null
  return notifyRuntime.playerId
}

function resolveCurrentWorld() {
  const gameData = getGameData()
  const world = String(gameData?.world || "").trim()
  return world || null
}

function getNotifyStorageCompose(playerId) {
  const currentWorld = resolveCurrentWorld()
  const normalizedPlayerId = Number(playerId)

  if (!Number.isInteger(normalizedPlayerId) || normalizedPlayerId <= 0) {
    return null
  }

  return {
    world: currentWorld || null,
    playerId: normalizedPlayerId,
    path: STORAGE_PATH,
  }
}

function getNotifyStorage(playerId) {
  const compose = getNotifyStorageCompose(playerId)
  if (!compose) return null

  const composeKey = `${compose.world || ""}:${compose.playerId}:${compose.path.join(":")}`

  if (!notifyStorageByComposeKey.has(composeKey)) {
    notifyStorageByComposeKey.set(composeKey, StorageLocalCompat.create(compose))
  }

  return notifyStorageByComposeKey.get(composeKey)
}

async function loadNotifyConfig(playerId) {
  registerNotifyStorageInspector(playerId)
  const storage = getNotifyStorage(playerId)
  const legacyKey = `${LEGACY_STORAGE_PREFIX}${playerId}`
  const legacyRaw = localStorage.getItem(legacyKey)

  if (legacyRaw && storage?.set) {
    try {
      const parsedLegacy = JSON.parse(legacyRaw)
      if (parsedLegacy && typeof parsedLegacy === "object") {
        await storage.set(parsedLegacy)
      }
    } catch (error) {
      console.warn("Erro ao migrar GO-Notify legado. Limpando chave antiga.", error)
    } finally {
      localStorage.removeItem(legacyKey)
    }
  }

  let raw = null

  try {
    raw = await storage?.get?.()
  } catch (error) {
    console.warn("[notify][storage:get]", error)
    raw = {}
  }

  const state = normalizeNotifyStorage(raw)

  try {
    await storage?.set?.(state)
  } catch (error) {
    console.warn("[notify][storage:set]", error)
  }

  notifyRuntime.storage = storage
  notifyRuntime.config = state.config
  notifyRuntime.telegram = {
    ...createTelegramUiState(),
    link: state.telegram.link,
    refreshCooldownUntilMs: state.telegram.refreshCooldownUntilMs,
  }
  return state.config
}

function shortTopic(value = "", size = 22) {
  const topic = String(value || "").trim()
  if (!topic) return "sem topico"
  if (topic.length <= size) return topic
  return `${topic.slice(0, size)}...`
}

function formatAppLabel(app = APP_TELEGRAM) {
  return app === APP_NOTIFY ? "ntfy" : "telegram"
}

function formatSummaryMeta(channelKey, entry = {}) {
  const status = entry.active ? "ativo" : "desligado"

  if (entry.app === APP_NOTIFY) {
    return `${status} via ntfy`
  }

  return `${status} via Telegram`
}

function formatSummaryExtra(entry = {}) {
  if (entry.app !== APP_NOTIFY) {
    return "Usa os chats vinculados no Telegram"
  }

  return shortTopic(entry.topic)
}

function formatTelegramSubscription(subscription = {}) {
  const username = String(subscription?.username || "").trim()
  const chatId = String(subscription?.chatId || "").trim()
  const status = String(subscription?.status || "").trim() || "unknown"

  if (username) {
    return `@${username} (${status})`
  }

  if (chatId) {
    return `chat ${chatId} (${status})`
  }

  return `chat sem identificador (${status})`
}

function formatTelegramLinkExpiresAt(value = null) {
  if (!value) return ""
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ""
  return dt.toLocaleString("pt-BR")
}

function stopTelegramRefreshCooldownTick() {
  if (typeof notifyRuntime.telegramRefreshTickUnsub === "function") {
    notifyRuntime.telegramRefreshTickUnsub()
  }
  notifyRuntime.telegramRefreshTickUnsub = null
}

function syncTelegramRefreshCooldownTick() {
  const remainingMs = getTelegramRefreshCooldownRemainingMs(notifyRuntime.telegram?.refreshCooldownUntilMs)

  if (remainingMs <= 0) {
    if (notifyRuntime.telegram?.refreshCooldownUntilMs) {
      notifyRuntime.telegram.refreshCooldownUntilMs = 0
      persistNotifyConfig()
    }
    stopTelegramRefreshCooldownTick()
    return
  }

  if (notifyRuntime.telegramRefreshTickUnsub) return

  notifyRuntime.telegramRefreshTickUnsub = useGoTiming.subscribe(() => {
    const nextRemainingMs = getTelegramRefreshCooldownRemainingMs(notifyRuntime.telegram?.refreshCooldownUntilMs)
    if (nextRemainingMs <= 0) {
      if (notifyRuntime.telegram?.refreshCooldownUntilMs) {
        notifyRuntime.telegram.refreshCooldownUntilMs = 0
        persistNotifyConfig()
      }
      stopTelegramRefreshCooldownTick()
    }
    renderNotifyPanel()
  }, { immediate: true })
}

function isTelegramLinkFresh(link = null) {
  if (!link?.expiresAt) return false
  const expiresAt = new Date(link.expiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return false
  return expiresAt - TELEGRAM_LINK_CACHE_SAFETY_MS > Date.now()
}

function updateSummaryItem(channelKey, entry = {}) {
  const card = notifyRuntime.node.querySelector(`#summary-${channelKey}`)
  if (!card) return
  card.className = `go-notify-summary-card ${entry.active ? "is-active" : "is-inactive"}`
  card.querySelector('.summary-meta').textContent = formatSummaryMeta(channelKey, entry)
  card.querySelector('.summary-extra').textContent = formatSummaryExtra(entry)
}

function updateChannelCard(channelKey, entry = {}) {
  const card = notifyRuntime.node.querySelector(`#card-${channelKey}`)
  if (!card) return
  
  const activeCheckbox = card.querySelector(`#notify-active-${channelKey}`)
  if (activeCheckbox) activeCheckbox.checked = !!entry.active
  
  const radioTelegram = card.querySelector(`#notify-app-${channelKey}-telegram`)
  if (radioTelegram) radioTelegram.checked = entry.app === APP_TELEGRAM
  
  const radioNtfy = card.querySelector(`#notify-app-${channelKey}-notify`)
  if (radioNtfy) radioNtfy.checked = entry.app === APP_NOTIFY
  
  const msgTelegram = card.querySelector('.topic-msg-telegram')
  const msgNtfy = card.querySelector('.topic-msg-ntfy')
  const topicInput = card.querySelector(`#notify-topic-${channelKey}`)
  const topicShort = card.querySelector('.topic-short')
  
  if (entry.app !== APP_NOTIFY) {
    msgTelegram.style.display = ''
    msgNtfy.style.display = 'none'
  } else {
    msgTelegram.style.display = 'none'
    msgNtfy.style.display = ''
    topicInput.value = entry.topic || ''
    topicShort.textContent = shortTopic(entry.topic, 42)
  }
}

function updateTelegramInfo() {
  const telegramState = notifyRuntime.telegram
  const refreshCooldownRemainingMs = getTelegramRefreshCooldownRemainingMs(telegramState.refreshCooldownUntilMs)
  const refreshCooldownRemainingSec = refreshCooldownRemainingMs > 0
    ? Math.ceil(refreshCooldownRemainingMs / 1000)
    : 0
  const refreshDisabled = telegramState.loading || refreshCooldownRemainingSec > 0
  const refreshLabel = refreshCooldownRemainingSec > 0
    ? `Atualizar QR (${refreshCooldownRemainingSec}s)`
    : "Atualizar QR"
  const refreshLabel2 = refreshCooldownRemainingSec > 0
    ? `Gerar QR (${refreshCooldownRemainingSec}s)`
    : "Gerar QR do Telegram"
  const activeSubscriptions = Array.isArray(telegramState.subscriptions)
    ? telegramState.subscriptions.filter((item) => item?.status === "active")
    : []

  const errorEl = notifyRuntime.node.querySelector('#telegram-error')
  if (telegramState.error) {
    errorEl.textContent = telegramState.error
    errorEl.style.display = ''
  } else {
    errorEl.style.display = 'none'
  }

  const loadingEl = notifyRuntime.node.querySelector('#telegram-loading')
  loadingEl.style.display = telegramState.loading ? '' : 'none'

  const subsOkEl = notifyRuntime.node.querySelector('#telegram-subs-ok')
  const subsWarnEl = notifyRuntime.node.querySelector('#telegram-subs-warn')
  if (activeSubscriptions.length > 0) {
    subsOkEl.style.display = ''
    subsWarnEl.style.display = 'none'
    notifyRuntime.node.querySelector('#telegram-subs-count').textContent = `${activeSubscriptions.length} chat(s) ativo(s) para este player.`
    const listEl = notifyRuntime.node.querySelector('#telegram-subs-list')
    listEl.innerHTML = activeSubscriptions.map(item => `<li>${escapeHtml(formatTelegramSubscription(item))}</li>`).join('')
  } else {
    subsOkEl.style.display = 'none'
    subsWarnEl.style.display = ''
  }

  const qrBox = notifyRuntime.node.querySelector('#telegram-qr-box')
  const noQrBox = notifyRuntime.node.querySelector('#telegram-no-qr-box')
  const btn1 = notifyRuntime.node.querySelector('#telegram-refresh-qr-btn1')
  const btn2 = notifyRuntime.node.querySelector('#telegram-refresh-qr-btn2')

  if (telegramState.link?.qrCodeDataUrl) {
    qrBox.style.display = ''
    noQrBox.style.display = 'none'
    
    notifyRuntime.node.querySelector('#telegram-link-open').href = telegramState.link.appUrl || telegramState.link.url
    notifyRuntime.node.querySelector('#telegram-command-input').value = telegramState.link.command || telegramState.link.token || ""
    notifyRuntime.node.querySelector('#telegram-qr-img').src = telegramState.link.qrCodeDataUrl
    notifyRuntime.node.querySelector('#telegram-expires-at').textContent = formatTelegramLinkExpiresAt(telegramState.link.expiresAt)
    
    btn1.disabled = refreshDisabled
    btn1.textContent = refreshLabel
  } else {
    qrBox.style.display = 'none'
    noQrBox.style.display = ''
    
    btn2.disabled = refreshDisabled
    btn2.textContent = refreshLabel2
  }
}

function renderNotifyPanel() {
  if (!notifyRuntime.node || !notifyRuntime.config) return

  updateSummaryItem('hCaptcha', notifyRuntime.config.hCaptcha)
  updateSummaryItem('incoming', notifyRuntime.config.incoming)

  updateChannelCard('hCaptcha', notifyRuntime.config.hCaptcha)
  updateChannelCard('incoming', notifyRuntime.config.incoming)

  updateTelegramInfo()
}

function createNotifyContainer(mountTarget = null) {
  const elemNode = mountTarget || document.querySelector("#contentContainer")
  if (!elemNode) return null

  const node = document.createElement("div")
  node.id = "go_contairner"
  node.className = "go-notify-container"
  node.innerHTML = notifyHtml

  const avatarEl = node.querySelector('#notify-bot-avatar')
  if (avatarEl) {
    avatarEl.src = resolveTelegramBotAvatarUrl()
    avatarEl.alt = TELEGRAM_BOT_USERNAME
  }

  elemNode.prepend(node)
  notifyRuntime.node = node
  return node
}

function resolveTelegramBotAvatarUrl() {
  try {
    return DEFAULT_NOTIFY_BOT_AVATAR_URL
  } catch {
    return TELEGRAM_BOT_AVATAR_FALLBACK
  }
}

async function persistNotifyConfig() {
  if (!notifyRuntime.storage || !notifyRuntime.config) return

  try {
    await notifyRuntime.storage.set({
      config: notifyRuntime.config,
      telegram: {
        link: notifyRuntime.telegram?.link || null,
        refreshCooldownUntilMs: normalizeCooldownUntilMs(notifyRuntime.telegram?.refreshCooldownUntilMs),
      },
    })
  } catch (error) {
    console.warn("[notify][storage:set]", error)
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    printMessage.success("Copiado para area de transferencia!", 2000)
  } catch (error) {
    console.error({ msg: error?.message || "Erro ao copiar", script: "copyText", error })
    printMessage.error("Erro ao copiar para a area de transferencia.", 3000)
  }
}

async function sendNotifyExtensionMessage({
  action,
  playerId = resolveCurrentPlayerId(),
  world = resolveCurrentWorld(),
  ...payload
} = {}) {
  if (!action) {
    throw new Error("Notify action is required")
  }

  if (!playerId || !world) {
    throw new Error("Sessao da extensao indisponivel para Notify")
  }

  const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: NOTIFY_MESSAGE_TYPE,
    action,
    playerId,
    world,
    ...payload,
  })

  if (!response?.ok) {
    throw new Error(response?.error || "Notify request failed")
  }

  return response
}

async function requestTelegramState({
  forceLink = false,
  forceStatus = false,
  playerId = resolveCurrentPlayerId(),
  world = resolveCurrentWorld(),
} = {}) {
  const response = await sendNotifyExtensionMessage({
    action: "telegram.state",
    forceLink,
    forceStatus,
    playerId,
    world,
  })

  return response?.data || {
    link: null,
    subscriptions: [],
  }
}

async function loadTelegramUiState({ forceStatus = false, forceLink = false } = {}) {
  if (!notifyRuntime.node) return

  const playerId = resolveCurrentPlayerId()
  const world = resolveCurrentWorld()

  if (!playerId || !world) {
    notifyRuntime.telegram = {
      ...createTelegramUiState(),
      refreshCooldownUntilMs: normalizeCooldownUntilMs(notifyRuntime.telegram?.refreshCooldownUntilMs),
      loaded: false,
      error: "Sessao da extensao indisponivel para consultar o Telegram.",
    }
    syncTelegramRefreshCooldownTick()
    renderNotifyPanel()
    return
  }

  const telegramState = {
    ...notifyRuntime.telegram,
    loading: true,
    error: "",
  }

  notifyRuntime.telegram = telegramState
  syncTelegramRefreshCooldownTick()
  renderNotifyPanel()

  const needsStatus = forceStatus || !telegramState.loaded
  const needsLink = forceLink || !isTelegramLinkFresh(telegramState.link)

  if (!needsStatus && !needsLink) {
    notifyRuntime.telegram.loading = false
    renderNotifyPanel()
    return
  }

  try {
    const payload = await requestTelegramState({
      forceLink: needsLink,
      forceStatus: needsStatus,
      playerId,
      world,
    })

    notifyRuntime.telegram.subscriptions = Array.isArray(payload?.subscriptions)
      ? payload.subscriptions
      : []
    notifyRuntime.telegram.link = normalizeTelegramLink(payload?.link)
    notifyRuntime.telegram.loaded = true
    await persistNotifyConfig()
  } catch (error) {
    notifyRuntime.telegram.error = error?.message || "Falha ao consultar o Telegram."
  } finally {
    notifyRuntime.telegram.loading = false
  }

  syncTelegramRefreshCooldownTick()
  renderNotifyPanel()
}

function getConfigContentNode() {
  return notifyRuntime.node?.querySelector("#go-config-notify-content") || null
}

async function onNotifyMenuClick(event) {
  event.preventDefault()
  const content = getConfigContentNode()
  if (!content) return

  if (content.classList.contains("show")) {
    content.classList.remove("show")
    return
  }

  content.classList.add("show")
  await loadTelegramUiState()
}

async function updateNotifyBadge() {
  if (!notifyRuntime.sectionApi) return
  const badgeState = await getNotifyBadgeState()
  notifyRuntime.sectionApi.setStatus(badgeState.statusLabel, badgeState.statusTone, badgeState.statusTooltip)
}

function updateChannelApp(channelKey, value) {
  const entry = notifyRuntime.config?.[channelKey]
  if (!entry) return

  const app = normalizeApp(value)
  if (!app) return

  entry.app = app
  persistNotifyConfig()
  updateNotifyBadge()
  renderNotifyPanel()
}

function updateChannelActive(channelKey, checked) {
  const entry = notifyRuntime.config?.[channelKey]
  if (!entry) return

  entry.active = Boolean(checked)
  persistNotifyConfig()
  void updateNotifyBadge()
  renderNotifyPanel()
}

async function onNotifyClick(event) {
  const menu = event.target.closest("#go-config-notify-menu")

  if (menu) {
    await onNotifyMenuClick(event)
    return
  }

  const actionNode = event.target.closest("[data-notify-action]")
  if (!actionNode) return

  const action = String(actionNode.dataset.notifyAction || "").trim()
  const channelKey = String(actionNode.dataset.channel || "").trim()
  const entry = notifyRuntime.config?.[channelKey]

  if (action === "copy-topic" && entry?.topic) {
    await copyText(entry.topic)
    return
  }

  if (action === "reset-topic" && entry) {
    entry.topic = uuidv4()
    persistNotifyConfig()
    renderNotifyPanel()
    await copyText(entry.topic)
    return
  }

  if (action === "copy-telegram-command" && notifyRuntime.telegram.link) {
    await copyText(
      notifyRuntime.telegram.link.command
      || notifyRuntime.telegram.link.token
      || notifyRuntime.telegram.link.url
    )
    return
  }

  if (action === "refresh-telegram") {
    const remainingMs = getTelegramRefreshCooldownRemainingMs(notifyRuntime.telegram?.refreshCooldownUntilMs)
    if (remainingMs > 0) return

    notifyRuntime.telegram.refreshCooldownUntilMs = getTelegramNowMsSafe() + TELEGRAM_REFRESH_QR_COOLDOWN_MS
    persistNotifyConfig()
    syncTelegramRefreshCooldownTick()
    renderNotifyPanel()
    await loadTelegramUiState({ forceStatus: true, forceLink: true })
    return
  }
}

function onNotifyChange(event) {
  const field = String(event.target?.dataset?.notifyField || "").trim()
  const channelKey = String(event.target?.dataset?.channel || "").trim()

  if (!field || !channelKey || !notifyRuntime.config?.[channelKey]) return

  if (field === "active") {
    updateChannelActive(channelKey, event.target.checked)
    return
  }

  if (field === "app") {
    updateChannelApp(channelKey, event.target.value)
  }
}

function bindNotifyEvents(node) {
  if (!node || node.dataset.notifyBound === "1") return

  node.addEventListener("click", onNotifyClick, true)
  node.addEventListener("change", onNotifyChange, true)
  node.dataset.notifyBound = "1"
}

function unbindNotifyEvents(node) {
  if (!node || node.dataset.notifyBound !== "1") return

  node.removeEventListener("click", onNotifyClick, true)
  node.removeEventListener("change", onNotifyChange, true)
  delete node.dataset.notifyBound
}

function destroyNotifyContainer() {
  const node = notifyRuntime.node || document.querySelector("#go_contairner")

  stopTelegramRefreshCooldownTick()

  if (node instanceof HTMLElement) {
    unbindNotifyEvents(node)
    node.remove()
  }

  notifyRuntime.node = null
  notifyRuntime.sectionApi = null
}

async function insertNotify(mountTarget = null, sectionApi = null) {
  destroyNotifyContainer()

  const playerId = resolveCurrentPlayerId()
  if (!playerId) return () => {}

  notifyRuntime.sectionApi = sectionApi

  await loadNotifyConfig(playerId)
  syncTelegramRefreshCooldownTick()
  const node = createNotifyContainer(mountTarget)
  if (!node) return () => {}

  bindNotifyEvents(node)
  node.querySelectorAll("[data-notify-bot-avatar]").forEach((imageNode) => {
    imageNode.addEventListener("error", () => {
      imageNode.src = TELEGRAM_BOT_AVATAR_FALLBACK
    }, { once: true })
  })
  renderNotifyPanel()

  return destroyNotifyContainer
}

function canDispatch(entry = {}) {
  return Boolean(entry?.active)
}

async function sendNotifyViaNtfy(entry, message) {
  const response = await sendNotifyExtensionMessage({
    action: "ntfy.send",
    message,
    topic: entry.topic,
  })

  return response?.sent === true
}

async function sendNotifyViaTelegram(playerId, message) {
  const response = await sendNotifyExtensionMessage({
    action: "telegram.send",
    message,
    playerId,
  })

  return response?.sent === true
}

async function sendNotify(type, body) {
  const channel = CHANNELS[type]
  if (!channel) return

  const playerId = resolveCurrentPlayerId()
  if (!playerId) return

  const storageNotify = getNotifyStorage(playerId)
  let raw = null

  try {
    raw = await storageNotify?.get?.()
  } catch (error) {
    console.warn("[notify][storage:get]", error)
    raw = {}
  }

  const state = normalizeNotifyStorage(raw)
  const config = state.config
  const entry = config[type]

  try {
    await storageNotify?.set?.(state)
  } catch (error) {
    console.warn("[notify][storage:set]", error)
  }

  if (!entry || !canDispatch(entry)) return

  const message = String(body || "").trim()
  if (!message) return
  let sent = false

  try {
    if (entry.app === APP_NOTIFY) {
      sent = await sendNotifyViaNtfy(entry, message)
    } else {
      sent = await sendNotifyViaTelegram(playerId, message)
    }
  } catch (error) {
    console.warn(`[notify:${entry.app}]`, error?.message || error)
    return
  }

  if (!sent) return

  if (notifyRuntime.playerId === playerId) {
    notifyRuntime.storage = storageNotify
    notifyRuntime.config = config
    renderNotifyPanel()
  }
}

async function getNotifyBadgeState() {
  const playerId = resolveCurrentPlayerId()
  if (!playerId) return { statusLabel: 'Desligado', statusTone: 'danger', statusTooltip: 'Requer login na página para funcionar.' }

  const storage = getNotifyStorage(playerId)
  let raw = null
  try {
    raw = await storage?.get?.()
  } catch (error) {}

  const state = normalizeNotifyStorage(raw)
  const config = state.config

  const activeChannels = []
  if (config?.hCaptcha?.active) activeChannels.push({ name: 'hCaptcha', app: config.hCaptcha.app })
  if (config?.incoming?.active) activeChannels.push({ name: 'Ataques chegando', app: config.incoming.app })

  if (activeChannels.length === 0) {
    return { statusLabel: 'Desligado', statusTone: 'danger', statusTooltip: 'Nenhuma notificação ativada.' }
  }

  const usesTelegram = activeChannels.some(ch => ch.app === APP_TELEGRAM)
  let telegramOk = true

  if (usesTelegram) {
    try {
      const payload = await requestTelegramState({ playerId, world: resolveCurrentWorld() })
      const subs = Array.isArray(payload?.subscriptions) ? payload.subscriptions : []
      telegramOk = subs.some(s => s?.status === 'active')
    } catch (e) {
      telegramOk = false
    }
  }

  const names = activeChannels.map(ch => ch.name).join(', ')

  if (usesTelegram && !telegramOk) {
    return {
      statusLabel: 'Sem chat',
      statusTone: 'warn',
      statusTooltip: `Ativos: ${names}.<br><br>⚠️ <b>Atenção:</b> Você ativou o envio via Telegram, mas nenhum chat está vinculado a este player. Abra o painel e gere o QR Code.`
    }
  }

  return {
    statusLabel: `${activeChannels.length} ativo${activeChannels.length > 1 ? 's' : ''}`,
    statusTone: 'active',
    statusTooltip: `Canais ativos:<br><b>${names}</b>`
  }
}

export { insertNotify, sendNotify, getNotifyBadgeState }
