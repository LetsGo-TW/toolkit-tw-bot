/// <reference types="chrome" />

import { v4 as uuidv4 } from 'uuid'
import { combineAbortControllerSignals, makeAjaxBody, makeAjaxHeadersGetDoc, StorageLocalCompat } from '@toolkit-tw-bot/browser'
import { Distance, getParamsUrl, nDateTime, strTimeToSec } from '@toolkit-tw-bot/core'
import {
  assertNoCaptchaInGame,
  assertNoGameUpdateOrBlockedRequest,
  dateServer,
  getGameData,
  incomingUnitSlow,
  initUnitdata,
  normalizeDateTwString,
  timeServer,
  travelSecond,
} from '@toolkit-tw-bot/document'
import Tooltip from '@toolkit-tw-bot/document/tooltip'
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { INCOMING_WATCH_MESSAGE_TYPE, NOTIFY_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'
import { collectNotPremiumIncomings } from './collectors/not-premium'
import { collectPremiumIncomings } from './collectors/premium'

/**
 * Incoming Watch
 *
 * Responsabilidades principais deste arquivo:
 * - Ler o contador de ataques chegando (#incomings_amount).
 * - Comparar o total anterior salvo no storage com o total atual da tela.
 * - Buscar as vilas que possuem ataques chegando.
 * - Entrar nos detalhes de cada comando novo para identificar atacante, vila origem,
 *   horário de chegada, unidade provável, envio e retorno.
 * - Salvar o estado dos incomings no storage local da extensão.
 * - Gerar notificação Telegram/ntfy quando novos ataques forem identificados.
 * - Sincronizar ícones/tooltip visual na tela para mostrar detalhes do ticket.
 */

type IncomingAttackEntry = {
  power: string | null
  ticket: string | null
  currentComment: string | null
  attacker: string | null
  attackerID: string | null
  attackerCoord: string | null
  attackerVillageID: string | null
  arrival: number | null
  taggedAt: number | null
}

type IncomingVillageState = {
  name: string | null
  coord: string | null
  comingAttack: Record<string, IncomingAttackEntry>
}

type IncomingState = {
  lastIncomingCount: number
  villages: Record<string, IncomingVillageState>
}

type NotifyEntry = {
  active: boolean
  app: 'telegram' | 'notify'
  topic: string
  sent: number
}

type NotifyStorageState = {
  config: {
    hCaptcha: NotifyEntry
    incoming: NotifyEntry
  }
}

type IncomingNotifyRow = {
  power: string | null
  ticket: string | null
  targetVillageId: string | null
  targetVillageName: string | null
  sourceName: string | null
  sourceVillageName: string | null
  arrivalText: string | null
  arrival: number | null
}

type IncomingWatchDecision = {
  ok?: boolean
  execute?: boolean
  reason?: string | null
  scopeKey?: string | null
}

const APP_TELEGRAM = 'telegram'
const APP_NOTIFY = 'notify'
const NOTIFY_STORAGE_PATH = ['notify', 'state']
const INCOMING_STORAGE_PATH = ['incoming', 'state']
const INCOMING_STATE_GRACE_MS = 60 * 1000
const INCOMING_VISUAL_SYNC_EVENT = 'toolkit:incoming:sync'
const INCOMING_VISUAL_SYNC_SELECTOR = '#quickedit-rename, #commands_incomings'
const INCOMING_VISUAL_TOOLTIP_SELECTOR = '[data-go-incoming-ticket-tooltip="1"]'
const INCOMING_VISUAL_TOOLTIP_ATTR = 'data-go-incoming-ticket-title'
const INCOMING_VISUAL_TOOLTIP_BOUND_ATTR = 'data-go-incoming-ticket-tooltip-bound'
const INCOMING_VISUAL_INFO_ICON_CLASS = 'go-incoming-ticket-info'
const INCOMING_PENDING_TICKET_MARKERS = new Set(['atac', 'attack', 'ataque', 'attacco'])
const INCOMING_PENDING_TICKET_MARKER_BY_MARKET: Record<string, string> = {
  ro: 'atac',
  br: 'ataque',
  en: 'attack',
  it: 'attacco',
  pt: 'ataque',
  us: 'attack',
  uk: 'attack',
}

const unitsByKey = new Map<string, any>()

/**
 * Estilo padrão dos logs de identificação no console.
 * Usado para destacar em vermelho os pontos importantes do Incoming Watch.
 */
const INCOMING_WATCH_RED_LOG_STYLE = 'color: red; font-weight: bold;'

/**
 * Log vermelho para mudança no contador total de incomings.
 * Mostra quantos ataques tinham antes, quantos existem agora e a diferença.
 */
function logIncomingWatchCountChange({
  previousCount,
  currentCount,
  diffCount,
  observedAt = Date.now(),
  context = 'incoming-watch',
}: {
  previousCount: number
  currentCount: number
  diffCount: number
  observedAt?: number
  context?: string
}) {
  console.log(
    `%c[${context}] Identificado mudança nos incomings | Antes: ${previousCount} | Agora: ${currentCount} | Diferença: ${diffCount} | ${new Date(observedAt).toLocaleString('pt-BR')}`,
    INCOMING_WATCH_RED_LOG_STYLE,
  )
}

/**
 * Log vermelho para cada comando novo identificado durante a leitura detalhada.
 */
function logIncomingWatchAttackIdentified({
  commandId,
  power,
  attacker,
  attackerCoord,
  targetVillageName,
  targetVillageId,
  arrivalText,
  ticket,
}: {
  commandId: string
  power: string | null
  attacker: string | null
  attackerCoord: string | null
  targetVillageName: string | null
  targetVillageId: string | null
  arrivalText: string | null
  ticket: string | null
}) {
  console.log(
    `%c[incoming-watch] Ataque identificado | Comando: ${commandId} | Força: ${power || 'unknown'} | Atacante: ${attacker || 'não identificado'} | Origem: ${attackerCoord || 'sem coord'} | Alvo: ${targetVillageName || targetVillageId || 'sem alvo'} | Chegada: ${arrivalText || 'sem chegada'} | Ticket: ${ticket || 'sem ticket'}`,
    INCOMING_WATCH_RED_LOG_STYLE,
  )
}

/**
 * Retorna o game_data atual da página.
 */
function getCurrentGameData() {
  return getGameData()
}

function getCurrentRuntimeParams() {
  return getParamsUrl(window.location.href, window.location.origin)
}

function getCurrentWorld() {
  return String(getCurrentGameData()?.world || '').trim() || null
}

function getCurrentPlayerId() {
  const raw = Number(getCurrentGameData()?.player?.id)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

/**
 * Cria o acesso ao storage local onde o estado dos incomings é salvo.
 * O storage é separado por mundo e jogador.
 */
function createIncomingStorage() {
  return StorageLocalCompat.create({
    world: getCurrentWorld(),
    playerId: getCurrentPlayerId(),
    path: INCOMING_STORAGE_PATH,
  })
}

function createNotifyStorage() {
  return StorageLocalCompat.create({
    world: getCurrentWorld(),
    playerId: getCurrentPlayerId(),
    path: NOTIFY_STORAGE_PATH,
  })
}

function normalizeFiniteNumber(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function calcContinentFromCoords(x: unknown, y: unknown) {
  const numX = normalizeFiniteNumber(x)
  const numY = normalizeFiniteNumber(y)
  if (numX == null || numY == null) return null
  return (Math.floor(numY / 100) * 10) + Math.floor(numX / 100)
}

function parseVillageInfoText(rawText = '') {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim()
  const coordsMatch = text.match(/\(\s*(\d+)\s*\|\s*(\d+)\s*\)/)
  const x = coordsMatch ? normalizeFiniteNumber(coordsMatch[1]) : null
  const y = coordsMatch ? normalizeFiniteNumber(coordsMatch[2]) : null
  const continentMatch = text.match(/\bK(\d{1,2})\b/i)
  const k = continentMatch
    ? normalizeFiniteNumber(continentMatch[1])
    : calcContinentFromCoords(x, y)
  const name = text
    .replace(/\s*\(\s*\d+\s*\|\s*\d+\s*\)\s*(?:K\d{1,2})?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const hasCoords = x != null && y != null
  const hasK = k != null
  const label = name
    ? hasCoords
      ? hasK
        ? `${name} (${x}|${y}) K${k}`
        : `${name} (${x}|${y})`
      : name
    : text

  return {
    name: name || null,
    x: hasCoords ? x : null,
    y: hasCoords ? y : null,
    k: hasK ? k : null,
    label: String(label || '').trim() || null,
  }
}

function parseVillageInfoCell(cell: Element | null) {
  const anchor = cell?.querySelector?.('a')
  const rawText = String(anchor?.textContent || cell?.textContent || '')
  return parseVillageInfoText(rawText)
}

function normalizeIncomingAttackEntry(entry: any = null): IncomingAttackEntry {
  return {
    power: String(entry?.power || '').trim() || null,
    ticket: String(entry?.ticket || '').trim() || null,
    currentComment: String(entry?.currentComment || '').trim() || null,
    attacker: String(entry?.attacker || '').trim() || null,
    attackerID: String(entry?.attackerID || '').trim() || null,
    attackerCoord: String(entry?.attackerCoord || '').trim() || null,
    attackerVillageID: String(entry?.attackerVillageID || '').trim() || null,
    arrival: Number.isFinite(Number(entry?.arrival)) ? Number(entry.arrival) : null,
    taggedAt: Number.isFinite(Number(entry?.taggedAt)) ? Number(entry.taggedAt) : null,
  }
}

function normalizeIncomingVillageState(value: any = null): IncomingVillageState {
  const comingAttackRaw = value?.comingAttack && typeof value.comingAttack === 'object'
    ? value.comingAttack
    : {}

  const comingAttack = Object.entries(comingAttackRaw).reduce((acc, [commandId, entry]) => {
    acc[String(commandId)] = normalizeIncomingAttackEntry(entry)
    return acc
  }, {} as Record<string, IncomingAttackEntry>)

  return {
    name: String(value?.name || '').trim() || null,
    coord: String(value?.coord || '').trim() || null,
    comingAttack,
  }
}

function createIncomingStateBase(): IncomingState {
  return {
    lastIncomingCount: 0,
    villages: {},
  }
}

/**
 * Normaliza o estado salvo dos incomings para garantir uma estrutura segura.
 */
function normalizeIncomingState(value: any = null): IncomingState {
  const base = createIncomingStateBase()
  const villagesRaw = value?.villages && typeof value.villages === 'object'
    ? value.villages
    : {}

  base.lastIncomingCount = Math.max(0, Math.floor(Number(value?.lastIncomingCount ?? 0) || 0))
  base.villages = Object.entries(villagesRaw).reduce((acc, [villageId, villageState]) => {
    const normalizedVillageId = String(villageId || '').trim()
    if (!normalizedVillageId) return acc
    acc[normalizedVillageId] = normalizeIncomingVillageState(villageState)
    return acc
  }, {} as Record<string, IncomingVillageState>)

  return base
}

/**
 * Remove comandos antigos/expirados do estado salvo.
 * Isso evita manter ataques que já chegaram há mais tempo que a tolerância.
 */
function pruneExpiredIncomingState(
  state: IncomingState,
  nowMs = Date.now(),
  graceMs = INCOMING_STATE_GRACE_MS,
): IncomingState {
  const nextState = normalizeIncomingState(state)
  const threshold = nowMs - graceMs

  Object.entries(nextState.villages).forEach(([villageId, villageState]) => {
    Object.entries(villageState.comingAttack).forEach(([commandId, entry]) => {
      if (entry.arrival !== null && entry.arrival < threshold) {
        delete villageState.comingAttack[commandId]
      }
    })

    if (!Object.keys(villageState.comingAttack).length && !villageState.name && !villageState.coord) {
      delete nextState.villages[villageId]
    }
  })

  return nextState
}

/**
 * Conta quantos tickets ainda estão pendentes de aplicação/renomeação.
 */
function countPendingIncomingTags(state: IncomingState) {
  return Object.values(normalizeIncomingState(state).villages)
    .reduce((total, villageState) => (
      total + Object.values(villageState.comingAttack)
        .filter((entry) => isIncomingApplyPendingEntry(entry))
        .length
    ), 0)
}

function isIncomingApplyPendingEntry(entry: IncomingAttackEntry | null | undefined) {
  if (!entry?.ticket || entry.taggedAt !== null) return false
  return INCOMING_PENDING_TICKET_MARKERS.has(getIncomingTicketMarker(entry.ticket))
}

function getIncomingTicketMarker(ticket = '') {
  const leadingSegment = String(ticket || '').split('|')[0] || ''
  const normalizedLeading = normalizeInlineText(leadingSegment).toLowerCase()
  const [marker = ''] = normalizedLeading.split(/\s+/)
  return marker.trim()
}

function resolveIncomingTicketMarker(currentComment: string | null = '') {
  const normalizedComment = normalizeInlineText(currentComment || '').toLowerCase()

  if (INCOMING_PENDING_TICKET_MARKERS.has(normalizedComment)) {
    return normalizedComment
  }

  const market = String(getCurrentGameData()?.market || '').trim().toLowerCase()
  return INCOMING_PENDING_TICKET_MARKER_BY_MARKET[market] || 'attack'
}

function getPremiumFeatureActive(source: unknown) {
  if (!source || typeof source !== 'object') return false

  const features = (source as Record<string, unknown>).features
  if (!features || typeof features !== 'object') return false

  const premium = (features as Record<string, unknown>)['Premium']
  if (!premium || typeof premium !== 'object') return false

  return (premium as Record<string, unknown>).active === true
}

function isPremiumAccountActive() {
  return getPremiumFeatureActive(getCurrentGameData())
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error || '')
}

export function isIncomingWatchExtensionContextInvalidated(error: unknown) {
  const message = getErrorMessage(error).trim().toLowerCase()

  return (
    message.includes('extension context invalidated')
    || message.includes('extension context was invalidated')
  )
}

export function shouldDeferIncomingWatchRead() {
  return getCurrentRuntimeParams().isTryConfirm === true
}

export function isIncomingWatchTransientError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }

  const message = getErrorMessage(error).trim().toLowerCase()
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('load failed')
  )
}

/**
 * Identifica erros esperados de proteção do jogo/CAPTCHA.
 *
 * Esses erros não devem ir para console.error, porque a tela de erros
 * da extensão captura console.error e exibe como falha crítica.
 */
export function isIncomingWatchBotProtectionError(error: unknown) {
  const message = getErrorMessage(error).trim().toLowerCase()

  return (
    message.includes('bot protection')
    || message.includes('captcha')
    || message.includes('hcaptcha')
    || message.includes('protectingbot')
  )
}

/**
 * Loga erros do runtime sem estourar erro crítico para casos esperados
 * de bot protection/CAPTCHA/context invalidated.
 */
function logIncomingWatchRuntimeError(
  context: string,
  error: unknown,
  fallbackMessage = 'Incoming watch runtime failed',
) {
  if (isIncomingWatchExtensionContextInvalidated(error)) {
    return
  }

  if (isIncomingWatchBotProtectionError(error)) {
    console.warn(
      `%c[incoming-watch][${context}] Bot protection/CAPTCHA detectado. Ignorando como erro crítico.`,
      'color: orange; font-weight: bold;',
      error,
    )
    return
  }

  console.error(
    `%c[incoming-watch][${context}]`,
    INCOMING_WATCH_RED_LOG_STYLE,
    error || fallbackMessage,
  )
}

/**
 * Lê o número atual exibido no contador #incomings_amount.
 */
function readCurrentIncomingAmount(root: ParentNode = document) {
  const totalRaw = Number(root.querySelector('#incomings_amount')?.textContent)
  return Number.isFinite(totalRaw) ? totalRaw : null
}

/**
 * Compara o total atual de incomings da tela com o último total salvo.
 *
 * Quando existe diferença, retorna o detail usado pelo restante do fluxo
 * e também registra no console, em vermelho, quantos tinham e quantos tem agora.
 */
export async function getIncomingBootstrapDetail({
  force = false,
}: {
  force?: boolean
} = {}) {
  const currentCount = readCurrentIncomingAmount(document)
  if (currentCount === null) return null

  const state = await readIncomingState()
  const previousCount = Math.max(0, Math.floor(Number(state.lastIncomingCount ?? 0) || 0))

  // O fluxo original só bootstrapava quando o contador total mudava.
  // Isso perde o caso em que um incoming novo entra e outro sai/chega junto:
  // o total fica igual, mas a fila real mudou e ainda precisamos reconciliar.
  //
  // `force=true` é usado por uma reconciliação periódica leve; nesses casos
  // ainda devolvemos o detail quando existe qualquer incoming conhecido, mesmo
  // sem delta no contador.
  if (currentCount === previousCount && force !== true) {
    return null
  }

  if (force === true && currentCount <= 0 && previousCount <= 0) {
    return null
  }

  const detail = {
    observedAt: Date.now(),
    previousCount,
    currentCount,
    diffCount: currentCount - previousCount,
  }

  logIncomingWatchCountChange({
    ...detail,
    context: force === true ? 'incoming-watch:bootstrap-force' : 'incoming-watch:bootstrap',
  })

  return detail
}

function getIncomingAttackEntryByCommandId(
  state: IncomingState,
  commandId: string | null | undefined,
): IncomingAttackEntry | null {
  const normalizedCommandId = String(commandId || '').trim()
  if (!normalizedCommandId) return null

  const currentVillageId = String(getCurrentGameData()?.village?.id || '').trim()
  if (currentVillageId) {
    const currentVillageEntry = state.villages?.[currentVillageId]?.comingAttack?.[normalizedCommandId]
    if (currentVillageEntry) {
      return currentVillageEntry
    }
  }

  for (const villageState of Object.values(state.villages || {})) {
    const entry = villageState?.comingAttack?.[normalizedCommandId]
    if (entry) {
      return entry
    }
  }

  return null
}

function escapeHtml(value = '') {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function stripIncomingTicketMarker(segment = '') {
  const normalizedSegment = normalizeInlineText(segment)
  if (!normalizedSegment) return ''

  const [rawMarker = '', ...parts] = normalizedSegment.split(/\s+/)
  if (!INCOMING_PENDING_TICKET_MARKERS.has(rawMarker.toLowerCase())) {
    return normalizedSegment
  }

  return parts.join(' ').trim()
}

/**
 * Monta o HTML do tooltip visual que aparece ao lado do comando.
 */
function buildIncomingVisualTooltipHtml(ticket = '') {
  const segments = splitNotifySegments(ticket)
  if (!segments.length) return ''

  const [unitSegment = '', ...detailSegments] = segments
  const unitLabel = stripIncomingTicketMarker(unitSegment)
  let iconSrc = ''

  try {
    iconSrc = chrome.runtime.getURL('icons/ico.green.128.png')
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.warn('[incoming-watch][tooltip:getURL]', error)
    }
  }
  const lines = [
    '<div style="display:flex; flex-direction:column; gap:0.3rem; min-width:15rem;">',
    '<div style="display:flex; align-items:center; gap:0.45rem;">',
    iconSrc
      ? `<img src="${escapeHtml(iconSrc)}" alt="" aria-hidden="true" style="width:16px; height:16px; border-radius:3px; flex:0 0 auto;">`
      : '',
    `<div style="color:#ffffff; font-size:12px; line-height:1.35; font-weight:700;">${escapeHtml(unitLabel || unitSegment)}</div>`,
    '</div>',
  ]

  detailSegments.forEach((segment) => {
    lines.push(
      `<div style="color:#e6dcc6; font-size:11px; line-height:1.35;">${escapeHtml(segment)}</div>`,
    )
  })

  lines.push('</div>')

  return lines.join('')
}

function resolveIncomingVisualTarget(element: Element | null) {
  const target = element?.querySelector?.('span.quickedit-label, span.quickedit-content')
    ?? element
  return target instanceof HTMLElement ? target : null
}

function resolveIncomingVisualHost(element: Element | null, target: HTMLElement | null) {
  if (!target) return null
  if (element && target !== element && target.parentElement) {
    return target.parentElement
  }

  return target
}

function findIncomingVisualInfoIcon(host: Element | null) {
  if (!(host instanceof HTMLElement)) return null

  return Array.from(host.children).find((child) => (
    child instanceof HTMLElement
    && child.dataset.goIncomingTicketTooltip === '1'
  )) as HTMLElement | undefined || null
}

function createIncomingVisualInfoIcon() {
  const icon = document.createElement('span')
  icon.className = `icon info-small ${INCOMING_VISUAL_INFO_ICON_CLASS}`.trim()
  icon.setAttribute('data-title', '')
  icon.setAttribute('data-go-incoming-ticket-tooltip', '1')
  icon.setAttribute('aria-label', 'Incoming details')
  icon.tabIndex = 0
  icon.style.marginLeft = '4px'
  icon.style.verticalAlign = 'middle'
  icon.style.cursor = 'help'
  return icon
}

function updateIncomingTicketInfoIcon(
  element: Element | null,
  ticket: string | null | undefined,
) {
  const target = resolveIncomingVisualTarget(element)
  const host = resolveIncomingVisualHost(element, target)
  const existingIcon = findIncomingVisualInfoIcon(host)
  const nextTicket = normalizeInlineText(String(ticket || ''))

  if (!target || !host || !nextTicket) {
    if (existingIcon) {
      existingIcon.remove()
      return true
    }

    return false
  }

  const nextTooltipTitle = buildIncomingVisualTooltipHtml(nextTicket)
  if (!nextTooltipTitle) {
    if (existingIcon) {
      existingIcon.remove()
      return true
    }

    return false
  }

  let icon = existingIcon
  let changed = false

  if (!(icon instanceof HTMLElement)) {
    icon = createIncomingVisualInfoIcon()

    if (target !== host) {
      target.insertAdjacentElement('afterend', icon)
    } else {
      host.appendChild(icon)
    }

    changed = true
  }

  if (icon.getAttribute(INCOMING_VISUAL_TOOLTIP_ATTR) !== nextTooltipTitle) {
    icon.setAttribute(INCOMING_VISUAL_TOOLTIP_ATTR, nextTooltipTitle)
    changed = true
  }

  return changed
}

function clearIncomingVisualInfoIcons(root: ParentNode = document) {
  const icons = Array.from(root.querySelectorAll?.(INCOMING_VISUAL_TOOLTIP_SELECTOR) || [])
  icons.forEach((icon) => icon.remove())
  return icons.length > 0
}

function ensureIncomingVisualTooltipBinding() {
  const markerHost = document.documentElement
  if (!markerHost) {
    return () => {}
  }

  if (markerHost.getAttribute(INCOMING_VISUAL_TOOLTIP_BOUND_ATTR) === '1') {
    return () => {}
  }

  markerHost.setAttribute(INCOMING_VISUAL_TOOLTIP_BOUND_ATTR, '1')

  const tooltip = new Tooltip({
    tooltipId: 'go-incoming-ticket-tooltip',
  })
  const unbind = tooltip.bind(document, INCOMING_VISUAL_TOOLTIP_SELECTOR, (el) => {
    const content = String(el.getAttribute(INCOMING_VISUAL_TOOLTIP_ATTR) || '').trim()
    return content || null
  })

  return () => {
    tooltip.hide()
    unbind()

    if (markerHost.getAttribute(INCOMING_VISUAL_TOOLTIP_BOUND_ATTR) === '1') {
      markerHost.removeAttribute(INCOMING_VISUAL_TOOLTIP_BOUND_ATTR)
    }
  }
}

/**
 * Sincroniza os ícones/tooltip visuais na tela de comandos chegando.
 * Se a conta tiver premium ativo, limpa os ícones extras porque o próprio jogo já possui recursos visuais.
 */
export async function syncIncomingVisualTags({
  state = null,
  root = document,
}: {
  state?: IncomingState | null
  root?: ParentNode
} = {}) {
  if (isPremiumAccountActive()) {
    return clearIncomingVisualInfoIcons(root ?? document)
  }

  const normalizedState = normalizeIncomingState(state ?? await readIncomingState())
  if (!Object.keys(normalizedState.villages || {}).length) return false

  let changed = false
  const rootNode = root ?? document

  const quickedit = rootNode.querySelector?.('#quickedit-rename') ?? null
  const quickeditCommandId = String(
    (quickedit as HTMLElement | null)?.dataset?.id
    || quickedit?.querySelector?.('span.quickedit')?.getAttribute?.('data-id')
    || (quickedit?.querySelector?.('span.quickedit') as HTMLElement | null)?.dataset?.id
    || '',
  ).trim()
  const quickeditTicket = getIncomingAttackEntryByCommandId(normalizedState, quickeditCommandId)?.ticket
  changed = updateIncomingTicketInfoIcon(quickedit, quickeditTicket) || changed

  const commandsTable = rootNode.querySelector?.('#commands_incomings') ?? null
  commandsTable?.querySelectorAll?.('tr.command-row')?.forEach?.((row) => {
    const commandId = String(
      (row.querySelector('span.quickedit') as HTMLElement | null)?.dataset?.id
      || row.querySelector('span.quickedit')?.getAttribute?.('data-id')
      || '',
    ).trim()
    const ticket = getIncomingAttackEntryByCommandId(normalizedState, commandId)?.ticket
    changed = updateIncomingTicketInfoIcon(row, ticket) || changed
  })

  return changed
}

function dispatchIncomingVisualSyncEvent() {
  try {
    window.dispatchEvent(new Event(INCOMING_VISUAL_SYNC_EVENT))
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.warn('[incoming-watch][visual-sync:event]', error)
    }
  }
}

/**
 * Lê o estado dos incomings no storage local da extensão.
 */
async function readIncomingState(): Promise<IncomingState> {
  try {
    const storage = createIncomingStorage()
    return pruneExpiredIncomingState(normalizeIncomingState(await storage.get()))
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.warn('[incoming-watch][storage:get]', error)
    }
    return createIncomingStateBase()
  }
}

/**
 * Salva o estado dos incomings no storage local e dispara sincronização visual.
 */
async function writeIncomingState(state: IncomingState) {
  const nextState = pruneExpiredIncomingState(normalizeIncomingState(state))
  let stored = false

  try {
    const storage = createIncomingStorage()
    await storage.set(nextState)
    stored = true
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.warn('[incoming-watch][storage:set]', error)
    }
  }

  if (stored) {
    dispatchIncomingVisualSyncEvent()
  }

  return nextState
}

function buildDefaultNotifyEntry(): NotifyEntry {
  return {
    active: false,
    app: APP_TELEGRAM,
    topic: uuidv4(),
    sent: 0,
  }
}

function normalizeNotifyEntry(raw: any = {}): NotifyEntry {
  const fallback = buildDefaultNotifyEntry()
  const app = String(raw?.app || '').trim().toLowerCase()
  const topic = String(raw?.topic || raw?.teme || raw?.tema || '').trim()

  return {
    active: Boolean(raw?.active),
    app: app === APP_NOTIFY ? APP_NOTIFY : APP_TELEGRAM,
    topic: topic || fallback.topic,
    sent: Number.isFinite(Number(raw?.sent)) ? Number(raw.sent) : 0,
  }
}

function normalizeNotifyStorage(raw: any = {}): NotifyStorageState {
  const source = raw && typeof raw === 'object' ? raw : {}
  const configSource = source?.config && typeof source.config === 'object'
    ? source.config
    : source

  return {
    config: {
      hCaptcha: normalizeNotifyEntry(configSource.hCaptcha),
      incoming: normalizeNotifyEntry(configSource.incoming),
    },
  }
}

async function sendNotifyExtensionMessage({
  action,
  playerId = getCurrentPlayerId(),
  world = getCurrentWorld(),
  ...payload
}: Record<string, unknown> = {}) {
  if (!action) {
    throw new Error('Notify action is required')
  }

  if (!playerId || !world) {
    throw new Error('Sessao da extensao indisponivel para Notify')
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
    throw new Error(response?.error || 'Notify request failed')
  }

  return response
}

/**
 * Envia a notificação de incoming via Telegram ou ntfy, conforme configuração salva.
 */
async function sendIncomingNotify(body = '') {
  const playerId = getCurrentPlayerId()
  const world = getCurrentWorld()
  if (!playerId || !world) return false

  let raw = null

  try {
    raw = await createNotifyStorage().get()
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.warn('[incoming-watch][notify:storage:get]', error)
    }
  }

  const state = normalizeNotifyStorage(raw)
  const entry = state.config.incoming
  const message = String(body || '').trim()

  if (!entry?.active || !message) return false

  if (entry.app === APP_NOTIFY) {
    const response = await sendNotifyExtensionMessage({
      action: 'ntfy.send',
      message,
      topic: entry.topic,
      playerId,
      world,
    })
    return response?.sent === true
  }

  const response = await sendNotifyExtensionMessage({
    action: 'telegram.send',
    message,
    playerId,
    world,
  })

  return response?.sent === true
}

function normalizeInlineText(value = '') {
  return String(value || '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function splitNotifySegments(value = '') {
  return String(value || '')
    .split('|')
    .map((segment) => normalizeInlineText(segment))
    .filter(Boolean)
}

function stripLeadingEmojiLabel(value = '') {
  return String(value || '')
    .replace(/^[^\p{L}\p{N}]+\s*/u, '')
    .trim()
}

/**
 * Converte o texto de chegada do Tribal Wars em timestamp.
 */
function parseArrivalData(arrivalText = '') {
  const raw = String(arrivalText || '').trim()
  if (!raw) return null

  const date = normalizeDateTwString(raw)
  const time = raw.match(/[0-9]{2}[:][0-9]{2}[:][0-9]{2}/ig)?.[0] || null
  const ms = raw.match(/[0-9]{3}$/ig)?.[0] || '000'

  if (!date || !time) return null

  return {
    arrivalText: raw,
    arrival: nDateTime(date, time, ms),
    arrivalParts: [date, time, ms],
  }
}

function getBackTime(travel: number, arrival: string[]) {
  const strDateTime = new Date(nDateTime(arrival[0], arrival[1]) + (travel * 1000)).toLocaleString('pt-BR')
  const arrDateTime = strDateTime.split(' ')
  return `${arrDateTime[0].substring(0, 5)} ${arrDateTime[1]}`
}

function getLaunchTime(travel: number, arrival: string[]) {
  const strDateTime = new Date(nDateTime(arrival[0], arrival[1]) - (travel * 1000)).toLocaleString('pt-BR')
  const arrDateTime = strDateTime.split(' ')
  return `${arrDateTime[0].substring(0, 5)} - ${arrDateTime[1]}`
}

function attackPower(row: Element) {
  const iconEl = row.querySelector('span.icon-container img')
  const iconSrc = String(iconEl?.getAttribute?.('src') || (iconEl as HTMLImageElement | null)?.src || '').trim()
  const match = iconSrc.match(/attack_(.*?)\.webp/i)
  return match?.[1] || null
}

async function ensureUnitMapLoaded() {
  const dataUnitsJson = await initUnitdata()
  if (!dataUnitsJson || typeof dataUnitsJson !== 'object') {
    throw new Error('Data units not found!')
  }

  unitsByKey.clear()
  Object.entries(dataUnitsJson).forEach(([key, value]) => unitsByKey.set(key, value))
}

/**
 * Calcula distância, tempo de viagem e unidade provável do ataque.
 */
function resolveIncomingTravelMeta({
  sourceCoord = '',
  targetCoord = '',
  travelText = '',
}: {
  sourceCoord?: string
  targetCoord?: string
  travelText?: string
}) {
  const source = String(sourceCoord || '').match(/\d+\|\d+/)?.[0] || null
  const target = String(targetCoord || '').match(/\d+\|\d+/)?.[0] || null
  const parsedTravelSeconds = strTimeToSec(String(travelText || '').trim())

  if (
    !source
    || !target
    || parsedTravelSeconds === null
    || !Number.isFinite(parsedTravelSeconds)
    || parsedTravelSeconds <= 0
  ) {
    return null
  }

  const travelSeconds: number = parsedTravelSeconds

  const distance = Distance.create(target).calc(source)
  if (!Number.isFinite(distance) || distance <= 0) {
    return null
  }

  const unitSlower = incomingUnitSlow(travelSeconds, distance)
  if (!unitSlower) return null

  return {
    distance,
    travelSeconds,
    unitSlower,
    travel: Math.round(travelSecond(distance, unitSlower)),
  }
}

/**
 * Monta o ticket/texto salvo no comando, contendo unidade provável, registro, envio e retorno.
 */
function buildIncomingTicket({
  arrivalParts = null,
  travel = 0,
  unitSlower = '',
  currentComment = '',
}: {
  arrivalParts?: string[] | null
  travel?: number
  unitSlower?: string
  currentComment?: string | null
}) {
  if (!Array.isArray(arrivalParts) || arrivalParts.length < 2) return null
  const attackMarker = resolveIncomingTicketMarker(currentComment)
  const unitName = unitsByKey.get(unitSlower)?.name || unitSlower
  const currentDateValue = dateServer()
  const currentDate = typeof currentDateValue === 'string'
    ? currentDateValue.split('/')
    : []
  return `${attackMarker} ${unitName} | 📝 ${currentDate[0] || ''}/${currentDate[1] || ''} ${timeServer()} | 🚀 ${getLaunchTime(travel, arrivalParts)} | 🏠 ${getBackTime(travel, arrivalParts)} |`
}

/**
 * Coleta na visão geral todas as vilas que possuem incoming.
 */
function collectIncomingVillages(html: Document = document) {
  const rows = Array.from(html.querySelectorAll('tr.nowrap'))
  return rows.reduce((arr, row) => {
    const villageSpan = row.querySelector('span.quickedit-vn')
    const villageTd = villageSpan?.closest?.('td') || null
    const villageId = Number((villageSpan as HTMLElement | null)?.dataset?.id)
    const hasIncoming = Boolean(villageSpan?.querySelector?.('img'))

    if (!Number.isFinite(villageId) || !hasIncoming) {
      return arr
    }

    const info = parseVillageInfoCell(villageTd)
    arr.push({
      id: villageId,
      name: info?.name || null,
      coord: info?.x != null && info?.y != null ? `${info.x}|${info.y}` : null,
      label: info?.label || null,
    })
    return arr
  }, [] as Array<{ id: number; name: string | null; coord: string | null; label: string | null }>)
}

function buildPowerCountsText(notifyData: IncomingNotifyRow[]) {
  const powers: Record<string, string> = {
    small: '🟢',
    medium: '🟠',
    large: '🔴',
    unknown: '🔘',
  }
  const order = ['small', 'medium', 'large', 'unknown']
  const counts = notifyData.reduce((acc, { power }) => {
    const key = power || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return order
    .filter((power) => counts[power] > 0)
    .map((power) => `${powers[power] || '🔘'} ${counts[power]}`)
    .join(' | ')
}

function buildInfoVillageUrl(villageId: string | null) {
  const normalizedVillageId = String(villageId || '').trim()
  if (!normalizedVillageId) return null

  try {
    const url = new URL('/game.php', window.location.origin)
    url.searchParams.set('screen', 'info_village')
    url.searchParams.set('id', normalizedVillageId)
    return url.toString()
  } catch {
    return null
  }
}

/**
 * Gera o corpo da mensagem enviada para Telegram/ntfy.
 */
function generateIncomingNotifyBody({
  notifyData,
  newAttack,
  newSnob,
}: {
  notifyData: IncomingNotifyRow[]
  newAttack: number
  newSnob: number
}) {
  const powers: Record<string, string> = { small: '🟢', medium: '🟠', large: '🔴' }
  const textPowers = buildPowerCountsText(notifyData)
  const total = Number(document.querySelector('#incomings_amount')?.textContent || 0)
  const gameData = getCurrentGameData()
  let villageId: string | null = null
  let count = 1
  const lines = [`👤 Atacado: ${gameData?.world} - ${gameData?.player?.name}`]
  lines.push(`↳ ⚔️ Ataques: [${newAttack}/${total}] | 👑 ${newSnob} | ${textPowers}`)

  notifyData
    .slice()
    .sort((a, b) => {
      const villageCompare = Number(a.targetVillageId) - Number(b.targetVillageId)
      if (villageCompare !== 0) return villageCompare
      return Number(a.arrival) - Number(b.arrival)
    })
    .forEach(({
      power,
      ticket,
      targetVillageId,
      targetVillageName,
      sourceName,
      sourceVillageName,
      arrivalText,
    }) => {
      const targetVillageLine = normalizeInlineText(targetVillageName || '')
      const sourceVillageLine = normalizeInlineText(sourceVillageName || '')
      const sourcePlayerLine = normalizeInlineText(sourceName || '')
      const ticketSegments = splitNotifySegments(ticket || '')
      const arrivalLine = normalizeInlineText(arrivalText || '')

      if (!villageId || villageId !== targetVillageId) {
        lines.push('')
        lines.push(`🎯 Alvo: ${targetVillageLine}`)
        const infoVillageUrl = buildInfoVillageUrl(targetVillageId)
        if (infoVillageUrl) {
          lines.push(`↳ 🔗 Link: ${infoVillageUrl}`)
        }
        villageId = targetVillageId
        count = 1
      }

      if (ticketSegments.length) {
        const [unitLine, ...ticketDetails] = ticketSegments
        const [registeredRaw = '', sentRaw = '', returnRaw = ''] = ticketDetails
        const registeredLine = stripLeadingEmojiLabel(registeredRaw)
        const sentLine = stripLeadingEmojiLabel(sentRaw)
        const returnLine = stripLeadingEmojiLabel(returnRaw)
        lines.push('')
        lines.push(`${count}. Comando: ${power ? powers[power] : '🔘'} ${unitLine}`)
        if (registeredLine) lines.push(`↳ 📝 Registrado: ${registeredLine}`)
        if (sentLine) lines.push(`↳ 🚀 Enviado: ${sentLine}`)
        if (returnLine) lines.push(`↳ 🏠 Retorno: ${returnLine}`)
      } else {
        lines.push('')
        lines.push(`${count}. ${power ? powers[power] : '🔘'} Ataque identificado`)
      }

      lines.push(`↳ 👤 Atacante: ${sourcePlayerLine}`)
      lines.push(`↳ 📍 Vila: ${sourceVillageLine}`)
      lines.push(`↳ ⏱️ Chegada: ${arrivalLine}`)
      lines.push('')
      count++
    })

  return lines.join('\n').trim()
}

/**
 * Faz uma requisição AJAX autenticada para uma tela do jogo e devolve o HTML parseado.
 * Também valida CAPTCHA, atualização do jogo e possíveis bloqueios.
 */
async function getDoc(screen: string, villageId: string | number | null = null, { signal }: { signal?: AbortSignal } = {}) {
  const gameData = getCurrentGameData()
  const url = new URL(`${gameData?.link_base_pure}${screen}`, window.origin)
  if (villageId) url.searchParams.set('village', String(villageId))
  const headers = makeAjaxHeadersGetDoc()
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error('timeout')), 8000)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal
  const req = new Request(url.toString(), {
    method: 'GET',
    headers,
    credentials: 'include',
    referrerPolicy: 'origin',
    cache: 'no-store',
    signal: combinedSignal,
  })

  assertNoCaptchaInGame(document, 'incoming-watch:getDoc:pre-fetch')

  try {
    const res = await fetch(req)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    const html = new DOMParser().parseFromString(text, 'text/html')
    assertNoCaptchaInGame(html, 'incoming-watch:getDoc:html-response')
    assertNoGameUpdateOrBlockedRequest(html, { context: 'incoming-watch:getDoc:html-response' })
    return html
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Executa uma request já montada e devolve o HTML parseado.
 *
 * Usado pelo POST de troca de page_size do caminho premium.
 */
async function fetchHtmlByRequest(
  request: Request,
  {
    preCaptchaContext = '',
    postCaptchaContext = '',
  }: {
    preCaptchaContext?: string
    postCaptchaContext?: string
  } = {},
) {
  assertNoCaptchaInGame(document, preCaptchaContext)

  const response = await fetch(request)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const text = await response.text()
  const html = new DOMParser().parseFromString(text, 'text/html')

  assertNoCaptchaInGame(html, postCaptchaContext)
  assertNoGameUpdateOrBlockedRequest(html, { context: postCaptchaContext })

  return html
}

/**
 * Altera o page_size da tela premium de incomings.
 *
 * O premium usa page=-1 para buscar a primeira página inteira.
 * Quando existem mais de 1000 comandos, o collector premium ajusta page_size
 * para 1000 e então busca apenas as páginas extras.
 */
async function postChangePageSize(
  pageSize: number | null,
  screen: string,
  newPageSize = 1000,
  { signal }: { signal?: AbortSignal } = {},
) {
  if (!pageSize || Number(pageSize) === Number(newPageSize)) return

  const gameData = getCurrentGameData()
  const url = new URL(`${gameData?.link_base_pure}${screen}&action=change_page_size`, window.origin)

  const body = makeAjaxBody({
    page_size: newPageSize,
    h: gameData?.csrf,
  })

  const headers = makeAjaxHeadersGetDoc()
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error('timeout')), 8000)

  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  const req = new Request(url.toString(), {
    method: 'POST',
    headers,
    body,
    credentials: 'include',
    referrerPolicy: 'origin',
    cache: 'no-store',
    signal: combinedSignal,
  })

  try {
    await fetchHtmlByRequest(req, {
      preCaptchaContext: 'incoming-watch:setPageSize:pre-fetch',
      postCaptchaContext: 'incoming-watch:setPageSize:html-response',
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Pergunta ao service worker se este contexto/aba deve executar o fluxo de incoming watch.
 */
export async function requestIncomingWatchDecision(detail: {
  observedAt: number
  previousCount: number
  currentCount: number
  diffCount: number
}): Promise<IncomingWatchDecision> {
  const gameData = getCurrentGameData()
  const runtimeParams = getParamsUrl(window.location.href, window.location.origin)

  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'observe',
    world: gameData?.world ?? null,
    t: runtimeParams.t ?? null,
    playerId: getCurrentPlayerId(),
    ...detail,
  })
}

export async function requestIncomingApplyQueue({
  pendingTagCount,
}: {
  pendingTagCount: number
}) {
  const gameData = getCurrentGameData()
  const runtimeParams = getParamsUrl(window.location.href, window.location.origin)
  const premiumActive = getPremiumFeatureActive(gameData)
  const nextPendingTagCount = premiumActive ? pendingTagCount : 0

  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'queue-apply',
    world: gameData?.world ?? null,
    t: runtimeParams.t ?? null,
    playerId: getCurrentPlayerId(),
    premiumActive,
    pendingTagCount: nextPendingTagCount,
  })
}

/**
 * Instala a sincronização visual que reage a mudanças no DOM e ao evento customizado.
 */
export function installIncomingVisualSync() {
  let destroyed = false
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  const bootstrapRetryTimers: Array<ReturnType<typeof setTimeout>> = []
  let syncInFlight = false
  let syncQueued = false
  const cleanupTooltipBinding = ensureIncomingVisualTooltipBinding()

  const flushSync = async() => {
    if (destroyed) return

    if (syncInFlight) {
      syncQueued = true
      return
    }

    syncInFlight = true

    try {
      await syncIncomingVisualTags()
    } finally {
      syncInFlight = false

      if (syncQueued && !destroyed) {
        syncQueued = false
        scheduleSync(0)
      }
    }
  }

  const scheduleSync = (delay = 0) => {
    if (destroyed) return

    if (pendingTimer) {
      clearTimeout(pendingTimer)
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null
      void flushSync()
    }, Math.max(0, Number(delay) || 0))
  }

  const onVisualSync = () => {
    scheduleSync(0)
  }

  window.addEventListener(INCOMING_VISUAL_SYNC_EVENT, onVisualSync)

  const observedRoot = document.body || document.documentElement
  const observer = observedRoot
    ? new MutationObserver(() => {
      if (!document.querySelector(INCOMING_VISUAL_SYNC_SELECTOR)) return
      scheduleSync(80)
    })
    : null

  observer?.observe(observedRoot, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  ;[0, 250, 1000, 2500, 5000].forEach((delay) => {
    bootstrapRetryTimers.push(setTimeout(() => {
      if (destroyed) return
      scheduleSync(0)
    }, delay))
  })

  return () => {
    destroyed = true

    if (pendingTimer) {
      clearTimeout(pendingTimer)
      pendingTimer = null
    }

    bootstrapRetryTimers.forEach((timerId) => clearTimeout(timerId))
    observer?.disconnect()
    window.removeEventListener(INCOMING_VISUAL_SYNC_EVENT, onVisualSync)
    cleanupTooltipBinding()
  }
}

/**
 * Fluxo principal de leitura, identificação, salvamento e notificação dos incomings.
 *
 * Passos principais:
 * 1. Carrega dados das unidades.
 * 2. Busca as vilas com incoming na visão geral.
 * 3. Para cada vila, lê os comandos chegando.
 * 4. Para cada comando novo, abre os detalhes, identifica origem, chegada e unidade provável.
 * 5. Salva no storage e envia notificação quando houver novos ataques.
 */
export async function readSaveNotifyIncomings() {
  await ensureUnitMapLoaded()

  const premiumActive = isPremiumAccountActive()

  console.log(
    `%c[incoming-watch:runtime] Iniciando coleta de incomings | premiumActive: ${premiumActive}`,
    INCOMING_WATCH_RED_LOG_STYLE,
  )

  const collectorContext = {
    getDoc,
    postChangePageSize,
    readIncomingState,

    normalizeIncomingVillageState,
    normalizeIncomingAttackEntry,
    pruneExpiredIncomingState,

    collectIncomingVillages,

    attackPower,
    normalizeInlineText,

    parseArrivalData,
    resolveIncomingTravelMeta,
    buildIncomingTicket,

    logIncomingWatchAttackIdentified,
  }

  const collectResult = premiumActive
    ? await collectPremiumIncomings(collectorContext)
    : await collectNotPremiumIncomings(collectorContext)

  const {
    state,
    notifyData,
    newAttack,
    newSnob,
  } = collectResult

  const nextState = await writeIncomingState(state)
  const pendingTagCount = countPendingIncomingTags(nextState)

  console.log(
    `%c[incoming-watch:runtime] Coleta finalizada | premiumActive: ${premiumActive} | newAttack: ${newAttack} | newSnob: ${newSnob} | notifyRows: ${notifyData.length} | pendingTagCount: ${pendingTagCount}`,
    INCOMING_WATCH_RED_LOG_STYLE,
  )

  if (notifyData.length) {
    const body = generateIncomingNotifyBody({
      notifyData,
      newAttack,
      newSnob,
    })

    if (body) {
      try {
        await sendIncomingNotify(body)
      } catch (error) {
        logIncomingWatchRuntimeError('notify', error)
      }
    }
  }

  return {
    state: nextState,
    notifyData,
    newAttack,
    newSnob,
    pendingTagCount,
  }
}
