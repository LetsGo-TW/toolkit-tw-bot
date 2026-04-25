/// <reference types="chrome" />

import { v4 as uuidv4 } from 'uuid'
import { combineAbortControllerSignals, makeAjaxHeadersGetDoc, StorageLocalCompat } from '@toolkit-tw-bot/browser'
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
import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { INCOMING_WATCH_MESSAGE_TYPE, NOTIFY_MESSAGE_TYPE } from '../../../../../../service-worker/message/types'

type IncomingAttackEntry = {
  power: string | null
  ticket: string | null
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

const unitsByKey = new Map<string, any>()

function getCurrentGameData() {
  return getGameData()
}

function getCurrentWorld() {
  return String(getCurrentGameData()?.world || '').trim() || null
}

function getCurrentPlayerId() {
  const raw = Number(getCurrentGameData()?.player?.id)
  return Number.isFinite(raw) && raw > 0 ? raw : null
}

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

function countPendingIncomingTags(state: IncomingState) {
  return Object.values(normalizeIncomingState(state).villages)
    .reduce((total, villageState) => (
      total + Object.values(villageState.comingAttack)
        .filter((entry) => Boolean(entry.ticket) && entry.taggedAt === null)
        .length
    ), 0)
}

async function readIncomingState(): Promise<IncomingState> {
  try {
    const storage = createIncomingStorage()
    return pruneExpiredIncomingState(normalizeIncomingState(await storage.get()))
  } catch (error) {
    console.warn('[incoming-watch][storage:get]', error)
    return createIncomingStateBase()
  }
}

async function writeIncomingState(state: IncomingState) {
  const nextState = pruneExpiredIncomingState(normalizeIncomingState(state))

  try {
    const storage = createIncomingStorage()
    await storage.set(nextState)
  } catch (error) {
    console.warn('[incoming-watch][storage:set]', error)
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

async function sendIncomingNotify(body = '') {
  const playerId = getCurrentPlayerId()
  const world = getCurrentWorld()
  if (!playerId || !world) return false

  let raw = null

  try {
    raw = await createNotifyStorage().get()
  } catch (error) {
    console.warn('[incoming-watch][notify:storage:get]', error)
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

function buildIncomingTicket({
  arrivalParts = null,
  travel = 0,
  unitSlower = '',
}: {
  arrivalParts?: string[] | null
  travel?: number
  unitSlower?: string
}) {
  if (!Array.isArray(arrivalParts) || arrivalParts.length < 2) return null
  const unitName = unitsByKey.get(unitSlower)?.name || unitSlower
  const currentDateValue = dateServer()
  const currentDate = typeof currentDateValue === 'string'
    ? currentDateValue.split('/')
    : []
  return `${unitName} | 📝 ${currentDate[0] || ''}/${currentDate[1] || ''} ${timeServer()} | 🚀 ${getLaunchTime(travel, arrivalParts)} | 🏠 ${getBackTime(travel, arrivalParts)} |`
}

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

  return await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'queue-apply',
    world: gameData?.world ?? null,
    t: runtimeParams.t ?? null,
    playerId: getCurrentPlayerId(),
    pendingTagCount,
  })
}

export async function readSaveNotifyIncomings() {
  await ensureUnitMapLoaded()

  const overviewVillagesHtml = await getDoc('overview_villages')
  const incomingVillages = collectIncomingVillages(overviewVillagesHtml)
  const incomingVillageIdSet = new Set(incomingVillages.map(({ id }) => String(id)))
  const state = await readIncomingState()
  const notifyData: IncomingNotifyRow[] = []
  let newAttack = 0
  let newSnob = 0

  Object.keys(state.villages).forEach((villageId) => {
    if (!incomingVillageIdSet.has(villageId)) {
      delete state.villages[villageId]
    }
  })

  if (!incomingVillages.length) {
    const totalRaw = Number(document.querySelector('#incomings_amount')?.textContent)
    state.lastIncomingCount = Number.isFinite(totalRaw) ? totalRaw : 0
    const nextState = await writeIncomingState(state)
    return {
      state: nextState,
      notifyData,
      newAttack,
      newSnob,
      pendingTagCount: countPendingIncomingTags(nextState),
    }
  }

  for (const incomingVillage of incomingVillages) {
    const villageId = String(incomingVillage.id)
    const previousVillageState = state.villages[villageId] || normalizeIncomingVillageState()
    const nextVillageState = normalizeIncomingVillageState({
      ...previousVillageState,
      name: incomingVillage.name ?? previousVillageState.name,
      coord: incomingVillage.coord ?? previousVillageState.coord,
    })
    const overviewHtml = await getDoc('overview', villageId)
    const commandsTable = overviewHtml.querySelector('#commands_incomings')

    if (!commandsTable) {
      delete state.villages[villageId]
      continue
    }

    const comingAttack = { ...nextVillageState.comingAttack }
    const arrAttackID = Array.from(commandsTable.querySelectorAll('tr.command-row'))
      .reduce((arr, row) => {
        const power = attackPower(row)
        const attId = String((row.querySelector('span.quickedit') as HTMLElement | null)?.dataset?.id || '').trim()
        if (!attId) return arr
        if (!comingAttack[attId]) {
          comingAttack[attId] = normalizeIncomingAttackEntry({})
        }
        arr.push({ attId, power })
        return arr
      }, [] as Array<{ attId: string; power: string | null }>)

    Object.keys(comingAttack).forEach((commandId) => {
      if (!arrAttackID.find(({ attId }) => Number(attId) === Number(commandId))) {
        delete comingAttack[commandId]
      }
    })

    for (const { attId, power } of arrAttackID) {
      if (comingAttack[attId]?.ticket) continue

      const infoCommandHtml = await getDoc(`info_command&id=${attId}&type=other`, villageId)
      const rows = Array.from(
        infoCommandHtml.querySelector('#content_value > table.vis > tbody')?.querySelectorAll?.('tr') || [],
      )

      if (rows.length < 3) continue

      const row1Cells = Array.from(rows[1]?.querySelectorAll('td') || [])
      const row2Cells = Array.from(rows[2]?.querySelectorAll('td') || [])
      const lastPlayerCell = row1Cells[row1Cells.length - 1]
      const lastVillageCell = row2Cells[row2Cells.length - 1]
      const attacker = normalizeInlineText(lastPlayerCell?.textContent || '')
      const attackerID = String(lastPlayerCell?.querySelector?.('a')?.href?.split('=')?.pop() || '').trim() || null
      const attackerVillageName = normalizeInlineText(lastVillageCell?.textContent || '')
      const attackerCoord = attackerVillageName.match(/\d+\|\d+/ig)?.[0] || null
      const attackerVillageID = String(lastVillageCell?.querySelector?.('a')?.href?.split('=')?.pop() || '').trim() || null
      const defenderCoord = nextVillageState.coord || incomingVillage.coord || null
      const defenderVillageName = normalizeInlineText(nextVillageState.name || incomingVillage.name || incomingVillage.label || `Vila ${villageId}`)
      const regExp = getCurrentGameData()?.market === 'pt'
        ? /[(][0-9]{2}[:][0-9]{2}[:][0-9]{2}[)][:][0-9]{3}$/ig
        : /[0-9]{2}[:][0-9]{2}[:][0-9]{2}[:][0-9]{3}$/ig
      const index = rows.reduce<number | null>((ind, row, i) => {
        if (String(row.textContent || '').match(regExp)) {
          return i
        }
        return ind
      }, null)

      if (index == null || !rows[index] || !rows[index + 1] || !defenderCoord || !attackerCoord) {
        continue
      }

      const arrivalText = String(Array.from(rows[index].querySelectorAll('td'))[1]?.textContent || '').trim()
      const arrivalData = parseArrivalData(arrivalText)
      if (!arrivalData) continue

      const { arrival, arrivalParts } = arrivalData
      const travelText = String(rows[index + 1]?.querySelectorAll('td')?.[1]?.textContent || '').trim()
      const travelMeta = resolveIncomingTravelMeta({
        sourceCoord: attackerCoord,
        targetCoord: defenderCoord,
        travelText,
      })

      if (!travelMeta) continue

      const { unitSlower, travel } = travelMeta
      const ticket = buildIncomingTicket({
        arrivalParts,
        travel,
        unitSlower,
      })

      if (!ticket) continue

      comingAttack[attId] = {
        ...normalizeIncomingAttackEntry(comingAttack[attId]),
        power,
        ticket,
        attacker,
        attackerID,
        attackerCoord,
        attackerVillageID,
        arrival,
      }

      newAttack++
      if (unitSlower === 'snob') newSnob++
      notifyData.push({
        power,
        ticket,
        targetVillageId: villageId,
        targetVillageName: defenderVillageName,
        sourceName: attacker,
        sourceVillageName: attackerVillageName,
        arrivalText,
        arrival,
      })
    }

    nextVillageState.comingAttack = pruneExpiredIncomingState({
      lastIncomingCount: state.lastIncomingCount,
      villages: {
        [villageId]: {
          ...nextVillageState,
          comingAttack,
        },
      },
    }).villages[villageId]?.comingAttack || {}

    state.villages[villageId] = normalizeIncomingVillageState(nextVillageState)
  }

  const totalRaw = Number(document.querySelector('#incomings_amount')?.textContent)
  state.lastIncomingCount = Number.isFinite(totalRaw) ? totalRaw : state.lastIncomingCount
  const nextState = await writeIncomingState(state)

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
        console.error('[incoming-watch][notify]', error)
      }
    }
  }

  return {
    state: nextState,
    notifyData,
    newAttack,
    newSnob,
    pendingTagCount: countPendingIncomingTags(nextState),
  }
}
