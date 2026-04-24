import "./style.css"
import { v4 as uuidv4 } from "uuid"
import { extensionId as RELEASE_EXTENSION_ID } from "@toolkit-tw-bot/release"
import { insert_toggle } from "../components/legacy"
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
  playerId: null,
  storage: null,
  config: null,
  rootBase: null,
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

function normalizeRootBaseValue(value = null) {
  if (!value) return null

  if (typeof value === "object") {
    return String(value?.base || value?.url || "").trim() || null
  }

  return String(value || "").trim() || null
}

function resolveRootBase(preferred = null) {
  const windowRoot = typeof window !== "undefined"
    ? normalizeRootBaseValue(window.__GO_WORKER_ROOT)
    : null
  const preferredRoot = normalizeRootBaseValue(preferred)
  const rootBase = preferredRoot || notifyRuntime.rootBase || windowRoot
  notifyRuntime.rootBase = rootBase || null
  return notifyRuntime.rootBase
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

function renderSummaryItem(channelKey, entry = {}) {
  return `
    <div class="go-notify-summary-card ${entry.active ? "is-active" : "is-inactive"}">
      <strong>${escapeHtml(CHANNELS[channelKey].title)}</strong>
      <span>${escapeHtml(formatSummaryMeta(channelKey, entry))}</span>
      <small>${escapeHtml(formatSummaryExtra(entry))}</small>
    </div>
  `
}

function renderTopicControls(channelKey, entry = {}) {
  if (entry.app !== APP_NOTIFY) {
    return `
      <div class="go-notify-helper">
        As notificacoes deste evento serao enviadas para os chats vinculados no Telegram.
      </div>
    `
  }

  return `
    <div class="go-notify-topic-block">
      <label class="go-notify-section-label" for="notify-topic-${channelKey}">Topico ${escapeHtml(CHANNELS[channelKey].title)}</label>
      <div class="go-notify-topic-row">
        <input
          id="notify-topic-${channelKey}"
          class="go-notify-topic-input"
          type="text"
          value="${escapeAttr(entry.topic)}"
          disabled
        >
        <button
          type="button"
          class="go-notify-icon-button"
          data-notify-action="copy-topic"
          data-channel="${channelKey}"
          title="Copiar topico"
        >📄</button>
        <button
          type="button"
          class="go-notify-icon-button"
          data-notify-action="reset-topic"
          data-channel="${channelKey}"
          title="Gerar novo topico"
        >↻</button>
      </div>
      <small class="go-notify-helper">${escapeHtml(shortTopic(entry.topic, 42))}</small>
    </div>
  `
}

function renderChannelCard(channelKey, entry = {}) {
  const activeId = `notify-active-${channelKey}`
  const radioTelegramId = `notify-app-${channelKey}-telegram`
  const radioNtfyId = `notify-app-${channelKey}-notify`

  return `
    <section class="go-notify-card">
      <div class="go-notify-card-header">
        <div>
          <strong>${escapeHtml(CHANNELS[channelKey].title)}</strong>
          <small>Envio unificado para Telegram e ntfy</small>
        </div>
      </div>

      <div class="go-notify-toggle-line">
        <label class="go-notify-section-label" for="${activeId}">Ativar notificacoes</label>
        <div class="go-notify-toggle-wrap">
          <input
            id="${activeId}"
            class="toggle"
            type="checkbox"
            data-notify-field="active"
            data-channel="${channelKey}"
            ${entry.active ? "checked" : ""}
          >
          <label for="${activeId}"></label>
        </div>
      </div>

      <div>
        <span class="go-notify-section-label">Aplicativo</span>
        <div class="go-notify-radio-row">
          <label class="go-notify-radio" for="${radioTelegramId}">
            <input
              id="${radioTelegramId}"
              type="radio"
              name="notify-app-${channelKey}"
              value="${APP_TELEGRAM}"
              data-notify-field="app"
              data-channel="${channelKey}"
              ${entry.app === APP_TELEGRAM ? "checked" : ""}
            >
            <span>Telegram</span>
          </label>
          <label class="go-notify-radio" for="${radioNtfyId}">
            <input
              id="${radioNtfyId}"
              type="radio"
              name="notify-app-${channelKey}"
              value="${APP_NOTIFY}"
              data-notify-field="app"
              data-channel="${channelKey}"
              ${entry.app === APP_NOTIFY ? "checked" : ""}
            >
            <span>ntfy</span>
          </label>
        </div>
      </div>

      ${renderTopicControls(channelKey, entry)}
    </section>
  `
}

function renderTelegramInfo() {
  const telegramState = notifyRuntime.telegram
  const refreshCooldownRemainingMs = getTelegramRefreshCooldownRemainingMs(telegramState.refreshCooldownUntilMs)
  const refreshCooldownRemainingSec = refreshCooldownRemainingMs > 0
    ? Math.ceil(refreshCooldownRemainingMs / 1000)
    : 0
  const refreshDisabled = telegramState.loading || refreshCooldownRemainingSec > 0
  const refreshLabel = refreshCooldownRemainingSec > 0
    ? `Atualizar QR (${refreshCooldownRemainingSec}s)`
    : "Atualizar QR"
  const activeSubscriptions = Array.isArray(telegramState.subscriptions)
    ? telegramState.subscriptions.filter((item) => item?.status === "active")
    : []

  const subscriptionsHtml = activeSubscriptions.length
    ? `
      <div class="go-notify-telegram-status ok">
        ${activeSubscriptions.length} chat(s) ativo(s) para este player.
      </div>
      <ul class="go-notify-telegram-list">
        ${activeSubscriptions.map((item) => `<li>${escapeHtml(formatTelegramSubscription(item))}</li>`).join("")}
      </ul>
    `
    : `
      <div class="go-notify-telegram-status warn">
        Nenhum chat ativo vinculado a este player.
      </div>
    `

  const errorHtml = telegramState.error
    ? `<div class="go-notify-telegram-status error">${escapeHtml(telegramState.error)}</div>`
    : ""

  const loadingHtml = telegramState.loading
    ? `<div class="go-notify-telegram-status">Carregando status e QR do Telegram...</div>`
    : ""

  const qrHtml = telegramState.link?.qrCodeDataUrl
    ? `
      <div class="go-notify-telegram-link-box">
        <div class="go-notify-telegram-link-actions">
          <a
            class="go-notify-link-button"
            href="${escapeAttr(telegramState.link.appUrl || telegramState.link.url)}"
          >Abrir no Telegram</a>
          <button
            type="button"
            class="go-notify-link-button"
            data-notify-action="copy-telegram-command"
          >Copiar /start</button>
          <button
            type="button"
            class="go-notify-link-button"
            data-notify-action="refresh-telegram"
            ${refreshDisabled ? "disabled" : ""}
          >${refreshLabel}</button>
        </div>
        <div class="go-notify-topic-row">
          <input
            class="go-notify-topic-input"
            type="text"
            value="${escapeAttr(telegramState.link.command || telegramState.link.token || "")}"
            readonly
          >
          <button
            type="button"
            class="go-notify-icon-button"
            data-notify-action="copy-telegram-command"
            title="Copiar comando /start"
          >📄</button>
        </div>
        <div class="go-notify-telegram-qr">
          <img
            src="${escapeAttr(telegramState.link.qrCodeDataUrl)}"
            alt="Qr code do Telegram"
          >
        </div>
        <small class="go-notify-helper">
          Expira em: ${escapeHtml(formatTelegramLinkExpiresAt(telegramState.link.expiresAt))}
          <br>
          1. Abra o bot pelo botao ou QR.
          <br>
          2. Copie e cole o comando <code>/start</code> acima no chat do bot.
        </small>
      </div>
    `
    : `
      <div class="go-notify-telegram-link-actions">
        <button
          type="button"
          class="go-notify-link-button"
          data-notify-action="refresh-telegram"
          ${refreshDisabled ? "disabled" : ""}
        >${refreshCooldownRemainingSec > 0 ? `Gerar QR (${refreshCooldownRemainingSec}s)` : "Gerar QR do Telegram"}</button>
      </div>
    `

  return `
    <section class="go-notify-card go-notify-card-telegram">
      <div class="go-notify-card-header">
        <div>
          <strong>Telegram</strong>
          <small>Vinculo do player atual com o bot</small>
        </div>
      </div>
      ${errorHtml}
      ${loadingHtml}
      ${subscriptionsHtml}
      ${qrHtml}
    </section>
  `
}

function renderNotifyPanel() {
  if (!notifyRuntime.node || !notifyRuntime.config) return

  const summaryNode = notifyRuntime.node.querySelector("#go-notify-summary")
  const configNode = notifyRuntime.node.querySelector("#go-config-notify-content")

  if (summaryNode) {
    summaryNode.innerHTML = `
      ${renderSummaryItem("hCaptcha", notifyRuntime.config.hCaptcha)}
      ${renderSummaryItem("incoming", notifyRuntime.config.incoming)}
    `
  }

  if (configNode) {
    configNode.innerHTML = `
      <div class="go-notify-grid">
        ${renderChannelCard("hCaptcha", notifyRuntime.config.hCaptcha)}
        ${renderChannelCard("incoming", notifyRuntime.config.incoming)}
      </div>
      ${renderTelegramInfo()}
    `
  }

  insert_toggle()
}

function createNotifyContainer() {
  const elemNode = document.querySelector("#contentContainer")
  if (!elemNode) return null

  const node = document.createElement("div")
  node.id = "go_contairner"
  node.className = "go-notify-container"
  node.innerHTML = `
    <div class="go-notify-shell">
      <div class="go-notify-header">
        <div class="go-notify-brand">
          <img
            class="go-notify-bot-avatar"
            src="${escapeAttr(resolveTelegramBotAvatarUrl())}"
            alt="${escapeAttr(TELEGRAM_BOT_USERNAME)}"
            data-notify-bot-avatar="1"
          >
          <div class="go-notify-title">
            <strong>Notify</strong>
            <small>Telegram e ntfy no mesmo painel</small>
          </div>
        </div>
        <div id="go-notify-summary" class="go-notify-summary"></div>
      </div>

      <div id="go-config-notify" class="go-notify-config">
        <a id="go-config-notify-menu" class="go-notify-config-menu">» Configurar notificacoes</a>
        <div id="go-config-notify-content"></div>
      </div>
    </div>
  `

  elemNode.prepend(node)
  notifyRuntime.node = node
  return node
}

function resolveTelegramBotAvatarUrl() {
  const rootBase = resolveRootBase()

  if (!rootBase) {
    return TELEGRAM_BOT_AVATAR_FALLBACK
  }

  try {
    return new URL("128.png", rootBase).toString()
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

function updateChannelApp(channelKey, value) {
  const entry = notifyRuntime.config?.[channelKey]
  if (!entry) return

  const app = normalizeApp(value)
  if (!app) return

  entry.app = app
  persistNotifyConfig()
  renderNotifyPanel()
}

function updateChannelActive(channelKey, checked) {
  const entry = notifyRuntime.config?.[channelKey]
  if (!entry) return

  entry.active = Boolean(checked)
  persistNotifyConfig()
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

async function insertNotify(data = null) {
  if (document.querySelector("#go_contairner")) return

  resolveRootBase(data?.rootBase || data?.root || data?.base || null)

  const playerId = resolveCurrentPlayerId()
  if (!playerId) return

  await loadNotifyConfig(playerId)
  syncTelegramRefreshCooldownTick()
  const node = createNotifyContainer()
  if (!node) return

  bindNotifyEvents(node)
  node.querySelectorAll("[data-notify-bot-avatar]").forEach((imageNode) => {
    imageNode.addEventListener("error", () => {
      imageNode.src = TELEGRAM_BOT_AVATAR_FALLBACK
    }, { once: true })
  })
  renderNotifyPanel()
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

export { insertNotify, sendNotify }
