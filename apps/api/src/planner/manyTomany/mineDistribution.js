import fs from 'node:fs'
import { Distance } from '@toolkit-tw-bot/utils'
import { computeSlowestUnit } from '../shared/slowestUnit.js'
import distributeSendersByTargets from './distributeSendersByTargets.js'

// Buffer conservador entre distribuição e envio efetivo.
// 60s reduz falsos "fora do BN" perto da virada de janela.
const DEFAULT_SEND_CONFIRM_BUFFER_MS = 60 * 1000
const DEFAULT_BN_START_LEAD_PER_COMMAND_MS = 1600
const DEFAULT_OPTIMIZED_TIMEOUT_MS = 1500
const DEFAULT_OPTIMIZED_DISPATCH_PER_COMMAND_MS = 1600
const DISTANCE_COST_SCALE = 1000
const DISTANCE_COST_TIE_BREAKER = 1000000
const speedByUnitJson = JSON.parse(
  fs.readFileSync(new URL('../unit/speed.json', import.meta.url), 'utf8')
)

function normalizeDistributionMode(value) {
  return String(value || '').trim().toLowerCase() === 'min_cost_max_flow'
    ? 'min_cost_max_flow'
    : 'sender_first'
}

function normalizeCoord(input) {
  if (!input) return null
  if (typeof input === 'string') {
    const [xRaw, yRaw] = String(input).split('|')
    const x = Number(xRaw)
    const y = Number(yRaw)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y, key: `${x}|${y}` }
  }
  const x = Number(input?.x)
  const y = Number(input?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y, key: `${x}|${y}` }
}

function normalizeNightBonusConfig(config = null) {
  const night = (config?.night && typeof config.night === 'object') ? config.night : (config || {})
  const activeRaw = Number(night?.activeMode ?? night?.active ?? 0)
  const startHour = Number(night?.start_hour ?? night?.startHour)
  const endHour = Number(night?.end_hour ?? night?.endHour)
  const activeMode = Number.isFinite(activeRaw) ? Math.max(0, Math.floor(activeRaw)) : 0
  return {
    active: activeMode > 0,
    activeMode,
    startHour: Number.isFinite(startHour) ? (startHour === 24 ? 0 : startHour) : null,
    endHour: Number.isFinite(endHour) ? (endHour === 24 ? 0 : endHour) : null
  }
}

function normalizePlayerId(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

function parseTargetPlayerIdState(target = null) {
  const rawValue = target?.playerId ?? target?.player_id ?? target?.owner
  if (rawValue == null || rawValue === '') return { playerId: null, explicitBarbarian: false, missing: true }
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return { playerId: null, explicitBarbarian: false, missing: true }
  if (parsed === 0) return { playerId: null, explicitBarbarian: true, missing: false }
  if (parsed < 0) return { playerId: null, explicitBarbarian: false, missing: true }
  return {
    playerId: Math.trunc(parsed),
    explicitBarbarian: false,
    missing: false
  }
}

function buildPlayerNightMoralStateMap(meta = null) {
  const list = Array.isArray(meta?.playerNightMoralState) ? meta.playerNightMoralState : []
  const map = new Map()
  list.forEach((item) => {
    const playerId = normalizePlayerId(item?.playerId)
    if (!playerId) return
    const night = normalizeNightBonusConfig(item?.night || null)
    const morale = Number(item?.moral ?? item?.morale)
    map.set(playerId, {
      playerId,
      night,
      morale: Number.isFinite(morale) && morale > 0 ? morale : null
    })
  })
  return map
}

function resolveNightBonusConfigForTarget({
  target = null,
  worldNightConfig = null,
  playerNightMoralStateById = null
} = {}) {
  const worldNight = normalizeNightBonusConfig(worldNightConfig)
  if (!worldNight.active) {
    return { config: worldNight, unknown: false, source: 'world-inactive' }
  }
  if (worldNight.activeMode !== 2) {
    return { config: worldNight, unknown: false, source: 'world' }
  }
  const { playerId, explicitBarbarian, missing } = parseTargetPlayerIdState(target)
  if (explicitBarbarian) {
    return { config: worldNight, unknown: false, source: 'barbarian-fallback' }
  }
  if (missing || !playerId) {
    return { config: null, unknown: true, source: 'unknown-target-player' }
  }
  const state = playerNightMoralStateById instanceof Map ? playerNightMoralStateById.get(playerId) : null
  const playerNight = normalizeNightBonusConfig(state?.night || null)
  if (playerNight.active && Number.isFinite(playerNight.startHour) && Number.isFinite(playerNight.endHour)) {
    return { config: playerNight, unknown: false, source: 'player' }
  }
  return { config: null, unknown: true, source: 'unknown-player-night' }
}

function getTimeOfDayMsAtTimestamp(arrivalMs, timezoneOffsetMinutes = null) {
  if (!Number.isFinite(Number(arrivalMs))) return null
  const offset = Number(timezoneOffsetMinutes)
  if (!Number.isFinite(offset)) {
    const d = new Date(Number(arrivalMs))
    return (
      (d.getHours() * 60 * 60 * 1000)
      + (d.getMinutes() * 60 * 1000)
      + (d.getSeconds() * 1000)
      + d.getMilliseconds()
    )
  }
  const shiftedMs = Number(arrivalMs) - (offset * 60 * 1000)
  const d = new Date(shiftedMs)
  return (
    (d.getUTCHours() * 60 * 60 * 1000)
    + (d.getUTCMinutes() * 60 * 1000)
    + (d.getUTCSeconds() * 1000)
    + d.getUTCMilliseconds()
  )
}

function isNightBonusAt(
  arrivalMs,
  config = null,
  {
    timezoneOffsetMinutes = null,
    startLeadMinutes = 0,
    startLeadMs = null
  } = {}
) {
  if (!Number.isFinite(Number(arrivalMs))) return false
  const night = normalizeNightBonusConfig(config)
  if (!night.active) return false
  if (!Number.isFinite(night.startHour) || !Number.isFinite(night.endHour)) return false
  const currentMs = getTimeOfDayMsAtTimestamp(arrivalMs, timezoneOffsetMinutes)
  if (!Number.isFinite(currentMs)) return false
  const resolvedStartLeadMs = Number.isFinite(Number(startLeadMs))
    ? Math.max(0, Math.floor(Number(startLeadMs)))
    : (
        Number.isFinite(Number(startLeadMinutes))
          ? Math.max(0, Math.floor(Number(startLeadMinutes))) * 60 * 1000
          : 0
      )
  const fullDayMs = 24 * 60 * 60 * 1000
  const startMsRaw = night.startHour * 60 * 60 * 1000
  const startMs = ((startMsRaw - resolvedStartLeadMs) + fullDayMs) % fullDayMs
  const endMs = night.endHour * 60 * 60 * 1000
  if (startMs === endMs) return false
  if (startMs < endMs) return currentMs >= startMs && currentMs < endMs
  return currentMs >= startMs || currentMs < endMs
}

function isNightBonusAtWithOffsetTolerance(
  arrivalMs,
  config = null,
  {
    timezoneOffsetMinutes = null,
    offsetToleranceMinutes = 0,
    startLeadMinutes = 0,
    startLeadMs = null
  } = {}
) {
  const baseOffset = Number.isFinite(Number(timezoneOffsetMinutes)) ? Number(timezoneOffsetMinutes) : null
  const tolerance = Number.isFinite(Number(offsetToleranceMinutes))
    ? Math.max(0, Math.floor(Number(offsetToleranceMinutes)))
    : 0

  if (isNightBonusAt(arrivalMs, config, { timezoneOffsetMinutes: baseOffset, startLeadMinutes, startLeadMs })) return true
  if (tolerance <= 0 || baseOffset == null) return false
  if (isNightBonusAt(arrivalMs, config, { timezoneOffsetMinutes: baseOffset + tolerance, startLeadMinutes, startLeadMs })) return true
  if (isNightBonusAt(arrivalMs, config, { timezoneOffsetMinutes: baseOffset - tolerance, startLeadMinutes, startLeadMs })) return true
  return false
}

function getTemplateSelectedUnits(template = null) {
  const units = Array.isArray(template?.units) ? template.units : []
  if (!units.length) return []

  const rawValues = template?.values
  const rows = Array.isArray(rawValues?.[0])
    ? rawValues
    : (Array.isArray(rawValues) ? [rawValues] : [])

  const selected = new Set()
  rows.forEach((row) => {
    if (!Array.isArray(row)) return
    row.forEach((raw, index) => {
      const value = Number(raw)
      if (!Number.isFinite(value) || value === 0) return
      const unit = units[index]
      if (unit) selected.add(unit)
    })
  })
  return Array.from(selected)
}

function buildUnitDataMapFromCommandSpeed() {
  const commandSpeed = speedByUnitJson?.command || {}
  return new Map(
    Object.entries(commandSpeed).map(([unit, minPerField]) => {
      const minutes = Number(minPerField)
      const fieldPerSecond = Number.isFinite(minutes) && minutes > 0
        ? (1 / (minutes * 60))
        : null
      return [unit, { speed: fieldPerSecond }]
    })
  )
}

function getSlowestUnitFromTemplate(template = null) {
  const selectedUnits = getTemplateSelectedUnits(template)
  const unitData = buildUnitDataMapFromCommandSpeed()
  return computeSlowestUnit(selectedUnits, unitData)?.slowest || null
}

function calcTravelSecondsForUnit({ unitName, distance, config }) {
  const baseMinPerField = Number(speedByUnitJson?.command?.[unitName])
  if (!Number.isFinite(baseMinPerField) || baseMinPerField <= 0) return null
  const speedWorld = Number(config?.speed)
  const unitSpeedWorld = Number(config?.unit_speed)
  const speedFactor = Number.isFinite(speedWorld) && speedWorld > 0 ? speedWorld : 1
  const unitSpeedFactor = Number.isFinite(unitSpeedWorld) && unitSpeedWorld > 0 ? unitSpeedWorld : 1
  // TW world config scales command time by both world speed and unit speed.
  // `unit_speed` < 1 makes units slower, so it must divide the speed factor (not multiply time down).
  const effectiveMinPerField = baseMinPerField / (speedFactor * unitSpeedFactor)
  const seconds = Number(distance) * effectiveMinPerField * 60
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null
}

function calcTravelSecondsFromEffectiveSecondsPerField({ distance, secondsPerField }) {
  const dist = Number(distance)
  const secPerField = Number(secondsPerField)
  if (!Number.isFinite(dist) || dist <= 0) return null
  if (!Number.isFinite(secPerField) || secPerField <= 0) return null
  const seconds = dist * secPerField
  return Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : null
}

function calcArrivalMsFromDistance({
  distance,
  slowestUnit,
  slowestUnitSecondsPerField = null,
  config,
  baseSendMs
}) {
  if (!Number.isFinite(Number(distance)) || !slowestUnit) return null
  const travelSeconds = Number.isFinite(Number(slowestUnitSecondsPerField)) && Number(slowestUnitSecondsPerField) > 0
    ? calcTravelSecondsFromEffectiveSecondsPerField({
      distance,
      secondsPerField: Number(slowestUnitSecondsPerField)
    })
    : calcTravelSecondsForUnit({
      unitName: slowestUnit,
      distance,
      config
    })
  if (!Number.isFinite(travelSeconds)) return null
  return baseSendMs + (travelSeconds * 1000)
}

function toNonNegativeInt(value) {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  return Math.floor(num)
}

function sortTargetIndexesBySenderDistance(sender, orderedTargets = []) {
  const senderCoord = normalizeCoord(sender)
  if (!senderCoord) return (Array.isArray(orderedTargets) ? orderedTargets : []).map((_, index) => index)
  return (Array.isArray(orderedTargets) ? orderedTargets : [])
    .map((target, index) => {
      const targetCoord = normalizeCoord(target)
      if (!targetCoord) return { index, distance: Infinity }
      const distance = Distance.create(senderCoord).calc(targetCoord)
      return { index, distance: Number.isFinite(distance) ? distance : Infinity }
    })
    .sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance
      return a.index - b.index
    })
    .map((item) => item.index)
}

function buildCommandEntriesFromTargetGroups(targetGroups = []) {
  const flat = []
  ;(Array.isArray(targetGroups) ? targetGroups : []).forEach((group, targetIndex) => {
    const target = group?.target || null
    const senders = Array.isArray(group?.senders) ? group.senders : []
    senders.forEach((sender, round) => {
      flat.push({
        targetIndex,
        round,
        target,
        source: sender,
        dispatchOrder: null,
        sendOffsetMs: null
      })
    })
  })
  flat.sort((a, b) => {
    if (a.round !== b.round) return a.round - b.round
    return a.targetIndex - b.targetIndex
  })
  return flat.map((entry, order) => ({
    ...entry,
    dispatchOrder: order
  }))
}

function buildUnknownNightError(nightUnknownCount = 0) {
  const error = new Error(
    `BN (active=2): faltam dados de night para ${nightUnknownCount} alvo(s)/player(s). Distribuição cancelada para garantir "Escapar BN".`
  )
  error.code = 'BN_UNKNOWN_PLAYER_NIGHT'
  error.meta = { nightUnknownCount }
  return error
}

function buildOptimizedTimeoutError(timeoutMs = DEFAULT_OPTIMIZED_TIMEOUT_MS) {
  const error = new Error(`Otimizado: timeout (${timeoutMs}ms)`)
  error.code = 'DISTRIBUTION_OPTIMIZED_TIMEOUT'
  error.meta = { timeoutMs }
  return error
}

function throwIfDeadlineExceeded(deadlineMs = null, timeoutMs = DEFAULT_OPTIMIZED_TIMEOUT_MS) {
  if (!Number.isFinite(Number(deadlineMs))) return
  if (Date.now() > Number(deadlineMs)) throw buildOptimizedTimeoutError(timeoutMs)
}

class MinBinaryHeap {
  constructor() {
    this.items = []
  }

  get size() {
    return this.items.length
  }

  push(node) {
    this.items.push(node)
    let idx = this.items.length - 1
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2)
      if (this.items[parentIdx].dist <= this.items[idx].dist) break
      const tmp = this.items[parentIdx]
      this.items[parentIdx] = this.items[idx]
      this.items[idx] = tmp
      idx = parentIdx
    }
  }

  pop() {
    if (!this.items.length) return null
    const top = this.items[0]
    const last = this.items.pop()
    if (this.items.length && last) {
      this.items[0] = last
      let idx = 0
      while (true) {
        const left = idx * 2 + 1
        const right = idx * 2 + 2
        let smallest = idx
        if (left < this.items.length && this.items[left].dist < this.items[smallest].dist) smallest = left
        if (right < this.items.length && this.items[right].dist < this.items[smallest].dist) smallest = right
        if (smallest === idx) break
        const tmp = this.items[idx]
        this.items[idx] = this.items[smallest]
        this.items[smallest] = tmp
        idx = smallest
      }
    }
    return top
  }
}

function createMinCostFlowGraph(nodeCount = 0) {
  const graph = Array.from({ length: Math.max(0, Number(nodeCount) || 0) }, () => [])
  const addEdge = (from, to, cap, cost) => {
    const fwd = { to, rev: graph[to].length, cap, cost }
    const rev = { to: from, rev: graph[from].length, cap: 0, cost: -cost }
    graph[from].push(fwd)
    graph[to].push(rev)
    return graph[from].length - 1
  }
  return { graph, addEdge }
}

function solveMinCostMaxFlow({
  senderCandidates = [],
  requestedQtyByIndex = [],
  timeoutMs = DEFAULT_OPTIMIZED_TIMEOUT_MS
} = {}) {
  const sendersCount = Array.isArray(senderCandidates) ? senderCandidates.length : 0
  const targetsCount = Array.isArray(requestedQtyByIndex) ? requestedQtyByIndex.length : 0
  const source = 0
  const senderOffset = 1
  const targetOffset = senderOffset + sendersCount
  const sink = targetOffset + targetsCount
  const nodeCount = sink + 1
  const deadlineMs = Date.now() + Math.max(1, Number(timeoutMs) || DEFAULT_OPTIMIZED_TIMEOUT_MS)
  const maxFlow = Math.min(
    sendersCount,
    requestedQtyByIndex.reduce((sum, qty) => sum + toNonNegativeInt(qty), 0)
  )
  const { graph, addEdge } = createMinCostFlowGraph(nodeCount)
  const candidateEdgeIndexBySender = Array.from({ length: sendersCount }, () => [])

  for (let senderIndex = 0; senderIndex < sendersCount; senderIndex += 1) {
    const senderNode = senderOffset + senderIndex
    addEdge(source, senderNode, 1, 0)
    const candidates = Array.isArray(senderCandidates[senderIndex]) ? senderCandidates[senderIndex] : []
    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i]
      const targetIndex = Number(candidate?.targetIndex)
      const cost = Number(candidate?.cost)
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= targetsCount) continue
      if (!Number.isFinite(cost) || cost < 0) continue
      const edgeIndex = addEdge(senderNode, targetOffset + targetIndex, 1, cost)
      candidateEdgeIndexBySender[senderIndex].push({ targetIndex, edgeIndex })
    }
  }

  for (let targetIndex = 0; targetIndex < targetsCount; targetIndex += 1) {
    const qty = toNonNegativeInt(requestedQtyByIndex[targetIndex])
    if (qty <= 0) continue
    addEdge(targetOffset + targetIndex, sink, qty, 0)
  }

  const potentials = Array(nodeCount).fill(0)
  const dist = Array(nodeCount).fill(Infinity)
  const prevNode = Array(nodeCount).fill(-1)
  const prevEdge = Array(nodeCount).fill(-1)

  let flow = 0
  let flowCost = 0

  while (flow < maxFlow) {
    throwIfDeadlineExceeded(deadlineMs, timeoutMs)
    dist.fill(Infinity)
    prevNode.fill(-1)
    prevEdge.fill(-1)
    dist[source] = 0
    const heap = new MinBinaryHeap()
    heap.push({ node: source, dist: 0 })

    let relaxSteps = 0
    while (heap.size > 0) {
      if (relaxSteps % 512 === 0) throwIfDeadlineExceeded(deadlineMs, timeoutMs)
      relaxSteps += 1
      const current = heap.pop()
      if (!current) break
      const node = current.node
      if (current.dist !== dist[node]) continue
      const edges = graph[node]
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
        const edge = edges[edgeIndex]
        if (!edge || edge.cap <= 0) continue
        const reducedCost = edge.cost + potentials[node] - potentials[edge.to]
        const nextDist = dist[node] + reducedCost
        if (nextDist < dist[edge.to]) {
          dist[edge.to] = nextDist
          prevNode[edge.to] = node
          prevEdge[edge.to] = edgeIndex
          heap.push({ node: edge.to, dist: nextDist })
        }
      }
    }

    if (!Number.isFinite(dist[sink])) break

    for (let node = 0; node < nodeCount; node += 1) {
      if (Number.isFinite(dist[node])) potentials[node] += dist[node]
    }

    let addFlow = maxFlow - flow
    for (let node = sink; node !== source; node = prevNode[node]) {
      const edge = graph[prevNode[node]]?.[prevEdge[node]]
      if (!edge) {
        addFlow = 0
        break
      }
      addFlow = Math.min(addFlow, edge.cap)
    }
    if (!Number.isFinite(addFlow) || addFlow <= 0) break

    let pathCost = 0
    for (let node = sink; node !== source; node = prevNode[node]) {
      const edge = graph[prevNode[node]][prevEdge[node]]
      edge.cap -= addFlow
      graph[node][edge.rev].cap += addFlow
      pathCost += edge.cost
    }

    flow += addFlow
    flowCost += pathCost * addFlow
  }

  const assignmentBySenderIndex = Array(sendersCount).fill(null)
  for (let senderIndex = 0; senderIndex < sendersCount; senderIndex += 1) {
    const senderNode = senderOffset + senderIndex
    const candidateEdges = candidateEdgeIndexBySender[senderIndex]
    for (let i = 0; i < candidateEdges.length; i += 1) {
      const candidate = candidateEdges[i]
      const edge = graph[senderNode]?.[candidate.edgeIndex]
      if (!edge) continue
      if (edge.cap === 0) {
        assignmentBySenderIndex[senderIndex] = candidate.targetIndex
        break
      }
    }
  }

  return {
    flow,
    cost: flowCost,
    assignmentBySenderIndex
  }
}

export function mineDistribution({
  mode = 'send',
  senders = [],
  targets = [],
  template = null,
  meta = {},
  config = {},
  options = {}
} = {}) {
  const normalizedMode = String(mode || '').trim().toLowerCase()
  if (normalizedMode !== 'send') {
    throw new Error('mineDistribution: mode ainda suportado apenas para "send".')
  }

  const typeGenerate = String(options?.typeGenerate || 'closest').trim().toLowerCase() === 'closest'
    ? 'closest'
    : 'furthest'
  const requestedDistributionMode = normalizeDistributionMode(options?.distributionMode)
  const scapeTheNight = Boolean(options?.scapeTheNight)
  const nowMs = Number.isFinite(Number(options?.nowMs)) ? Number(options.nowMs) : Date.now()
  const timezoneOffsetMinutes = Number.isFinite(Number(options?.timezoneOffsetMinutes))
    ? Number(options.timezoneOffsetMinutes)
    : null
  const nightOffsetToleranceMinutes = Number.isFinite(Number(options?.nightOffsetToleranceMinutes))
    ? Math.max(0, Math.floor(Number(options.nightOffsetToleranceMinutes)))
    : 0
  const optimizedTimeoutMs = Number.isFinite(Number(options?.optimizedTimeoutMs))
    ? Math.max(1, Math.floor(Number(options.optimizedTimeoutMs)))
    : DEFAULT_OPTIMIZED_TIMEOUT_MS
  const optimizedDispatchPerCommandMs = Number.isFinite(Number(options?.optimizedDispatchPerCommandMs))
    ? Math.max(0, Math.floor(Number(options.optimizedDispatchPerCommandMs)))
    : DEFAULT_OPTIMIZED_DISPATCH_PER_COMMAND_MS
  const sendConfirmBufferMs = Number.isFinite(Number(options?.sendConfirmBufferMs))
    ? Math.max(0, Math.floor(Number(options.sendConfirmBufferMs)))
    : DEFAULT_SEND_CONFIRM_BUFFER_MS
  const baseSendMs = nowMs + sendConfirmBufferMs
  const slowestUnitSecondsPerField = Number.isFinite(Number(options?.slowestUnitSecondsPerField))
    && Number(options.slowestUnitSecondsPerField) > 0
    ? Number(options.slowestUnitSecondsPerField)
    : null

  const raw = distributeSendersByTargets({
    senders,
    targets,
    typeGenerate
  })

  const originalTargetByCoordKey = new Map(
    (Array.isArray(targets) ? targets : [])
      .map((target) => {
        const coord = normalizeCoord(target)
        return coord?.key ? [coord.key, target] : null
      })
      .filter(Boolean)
  )
  const orderedTargets = (Array.isArray(raw?.orderedTargets) ? raw.orderedTargets : []).map((target) => {
    const coordKey = normalizeCoord(target)?.key || null
    const original = coordKey ? originalTargetByCoordKey.get(coordKey) : null
    if (!original) return target
    const normalizedCoord = normalizeCoord(target)
    const playerState = parseTargetPlayerIdState(original)
    const playerId = playerState.explicitBarbarian ? 0 : playerState.playerId
    const targetId = Number(original?.id)
    const qty = toNonNegativeInt(original?.qty)
    return {
      ...(normalizedCoord ? { x: normalizedCoord.x, y: normalizedCoord.y } : {}),
      ...(Number.isFinite(targetId) ? { id: targetId } : {}),
      ...(qty > 0 ? { qty } : {}),
      ...(playerId != null ? { playerId } : {})
    }
  })
  const orderedSenders = Array.isArray(raw?.orderedSenders) ? raw.orderedSenders : []
  const slowestUnit = String(options?.slowestUnit || '').trim() || getSlowestUnitFromTemplate(template)
  const requestedQtyByIndex = orderedTargets.map((target) => toNonNegativeInt(target?.qty))
  const requestedCommandsCount = requestedQtyByIndex.reduce((sum, qty) => sum + qty, 0)
  const nightStartLeadMs = Number.isFinite(Number(options?.nightStartLeadMs))
    ? Math.max(0, Math.floor(Number(options.nightStartLeadMs)))
    : (
        Number.isFinite(Number(options?.nightStartLeadMinutes))
          ? Math.max(0, Math.floor(Number(options.nightStartLeadMinutes))) * 60 * 1000
          : (scapeTheNight ? (requestedCommandsCount * DEFAULT_BN_START_LEAD_PER_COMMAND_MS) : 0)
      )
  const nightStartLeadMinutes = Math.floor(nightStartLeadMs / (60 * 1000))

  const targetGroups = orderedTargets.map((target, index) => ({
    target,
    requestedQty: requestedQtyByIndex[index] || 0,
    senders: [],
    pendingRejectedByNight: []
  }))

  const worldNightConfig = normalizeNightBonusConfig(meta?.worldNightConfig || config?.night || config)
  const playerNightMoralStateById = buildPlayerNightMoralStateMap(meta)
  const nightUnknownTargetKeys = new Set()
  const nightResolutionByTargetIndex = new Map()
  const senderCoords = orderedSenders.map((sender) => normalizeCoord(sender))
  const senderDistanceByIndex = senderCoords.map((coord) => (coord ? Distance.create(coord) : null))
  const targetCoords = orderedTargets.map((target) => normalizeCoord(target))
  const pairDistanceCache = Array.from({ length: orderedSenders.length }, () => new Map())
  const resetState = () => {
    targetGroups.forEach((group) => {
      group.senders = []
      group.pendingRejectedByNight = []
    })
    nightUnknownTargetKeys.clear()
    nightResolutionByTargetIndex.clear()
  }
  const getPairDistance = (senderIndex, targetIndex) => {
    const cache = pairDistanceCache[senderIndex]
    if (cache?.has(targetIndex)) return cache.get(targetIndex)
    const senderDistance = senderDistanceByIndex[senderIndex]
    const targetCoord = targetCoords[targetIndex]
    if (!senderDistance || !targetCoord) {
      cache?.set(targetIndex, null)
      return null
    }
    const distance = senderDistance.calc(targetCoord)
    const normalizedDistance = Number.isFinite(distance) ? Number(distance) : null
    cache?.set(targetIndex, normalizedDistance)
    return normalizedDistance
  }
  const resolveNightForTargetIndex = (targetIndex) => {
    if (nightResolutionByTargetIndex.has(targetIndex)) return nightResolutionByTargetIndex.get(targetIndex)
    const target = orderedTargets[targetIndex]
    const targetKey = normalizeCoord(target)?.key || `target:${targetIndex}`
    const resolvedNight = resolveNightBonusConfigForTarget({
      target,
      worldNightConfig,
      playerNightMoralStateById
    })
    if (resolvedNight?.unknown) nightUnknownTargetKeys.add(targetKey)
    const payload = { targetKey, resolvedNight }
    nightResolutionByTargetIndex.set(targetIndex, payload)
    return payload
  }
  const evaluatePairAvailability = ({
    senderIndex,
    targetIndex,
    registerNightReject = false,
    sendOffsetMs = 0
  } = {}) => {
    const distance = getPairDistance(senderIndex, targetIndex)
    if (!Number.isFinite(Number(distance))) {
      return {
        allowed: false,
        distance: null,
        rejectedByNight: false,
        unknownNight: false
      }
    }
    if (!scapeTheNight) {
      return {
        allowed: true,
        distance,
        rejectedByNight: false,
        unknownNight: false
      }
    }
    const { resolvedNight } = resolveNightForTargetIndex(targetIndex)
    if (resolvedNight?.unknown) {
      return {
        allowed: false,
        distance,
        rejectedByNight: false,
        unknownNight: true
      }
    }
    const arrivalMs = calcArrivalMsFromDistance({
      distance,
      slowestUnit,
      slowestUnitSecondsPerField,
      config,
      baseSendMs: baseSendMs + Math.max(0, Math.floor(Number(sendOffsetMs) || 0))
    })
    const rejectedByNight = isNightBonusAtWithOffsetTolerance(arrivalMs, resolvedNight?.config, {
      timezoneOffsetMinutes,
      offsetToleranceMinutes: nightOffsetToleranceMinutes,
      startLeadMinutes: nightStartLeadMinutes,
      startLeadMs: nightStartLeadMs
    })
    if (rejectedByNight && registerNightReject) {
      targetGroups[targetIndex]?.pendingRejectedByNight?.push?.(orderedSenders[senderIndex])
    }
    return {
      allowed: !rejectedByNight,
      distance,
      rejectedByNight,
      unknownNight: false
    }
  }

  const runSenderFirstDistribution = () => {
    resetState()
    const localNoTimeList = []
    const localUnusedByQuota = []
    const localRemainingQtyByIndex = [...requestedQtyByIndex]
    const hasRemainingTargetQty = () => localRemainingQtyByIndex.some((qty) => Number(qty) > 0)

    for (let senderIndex = 0; senderIndex < orderedSenders.length; senderIndex += 1) {
      const sender = orderedSenders[senderIndex]
      if (!hasRemainingTargetQty()) {
        localUnusedByQuota.push(...orderedSenders.slice(senderIndex))
        break
      }

      const sortedTargetIndexes = sortTargetIndexesBySenderDistance(sender, orderedTargets)
      let assigned = false
      let hadCandidateWithQty = false
      let hadNightReject = false
      let hadUnknownNight = false

      for (const targetIndex of sortedTargetIndexes) {
        if ((localRemainingQtyByIndex[targetIndex] || 0) <= 0) continue
        hadCandidateWithQty = true

        const pair = evaluatePairAvailability({
          senderIndex,
          targetIndex,
          registerNightReject: true
        })
        if (pair.unknownNight) {
          hadUnknownNight = true
          continue
        }
        if (!pair.allowed) {
          hadNightReject = true
          continue
        }

        targetGroups[targetIndex]?.senders?.push(sender)
        localRemainingQtyByIndex[targetIndex] = Math.max(0, Number(localRemainingQtyByIndex[targetIndex] || 0) - 1)
        assigned = true
        break
      }

      if (!assigned) {
        if (hadCandidateWithQty && scapeTheNight && hadNightReject && !hadUnknownNight) {
          localNoTimeList.push(sender)
        } else {
          localUnusedByQuota.push(sender)
        }
      }
    }

    if (scapeTheNight && worldNightConfig.activeMode === 2 && nightUnknownTargetKeys.size > 0) {
      throw buildUnknownNightError(nightUnknownTargetKeys.size)
    }

    return {
      noTimeList: localNoTimeList,
      unusedByQuota: localUnusedByQuota,
      remainingQtyByIndex: localRemainingQtyByIndex,
      optimizedMeta: null,
      commandEntries: buildCommandEntriesFromTargetGroups(targetGroups)
    }
  }

  const runOptimizedDistribution = () => {
    resetState()
    const localRemainingQtyByIndex = [...requestedQtyByIndex]
    const slotList = []
    const maxRequestedQty = requestedQtyByIndex.reduce((max, qty) => Math.max(max, toNonNegativeInt(qty)), 0)
    for (let round = 0; round < maxRequestedQty; round += 1) {
      for (let targetIndex = 0; targetIndex < orderedTargets.length; targetIndex += 1) {
        if ((requestedQtyByIndex[targetIndex] || 0) <= round) continue
        slotList.push({
          slotIndex: slotList.length,
          targetIndex,
          round,
          sendOffsetMs: slotList.length * optimizedDispatchPerCommandMs
        })
      }
    }
    const senderCandidates = Array.from({ length: orderedSenders.length }, () => [])
    const senderStates = Array.from({ length: orderedSenders.length }, () => ({
      hadCandidateWithQty: false,
      hadNightReject: false,
      hadUnknownNight: false
    }))

    for (let senderIndex = 0; senderIndex < orderedSenders.length; senderIndex += 1) {
      for (let slotIndex = 0; slotIndex < slotList.length; slotIndex += 1) {
        const slot = slotList[slotIndex]
        const targetIndex = Number(slot?.targetIndex)
        if (!Number.isFinite(targetIndex) || targetIndex < 0) continue
        senderStates[senderIndex].hadCandidateWithQty = true
        const pair = evaluatePairAvailability({
          senderIndex,
          targetIndex,
          registerNightReject: true,
          sendOffsetMs: slot?.sendOffsetMs
        })
        if (pair.unknownNight) {
          senderStates[senderIndex].hadUnknownNight = true
          continue
        }
        if (!pair.allowed) {
          senderStates[senderIndex].hadNightReject = true
          continue
        }
        const distanceCost = Math.max(0, Math.round(Number(pair.distance) * DISTANCE_COST_SCALE))
        const cost = (distanceCost * DISTANCE_COST_TIE_BREAKER) + slotIndex
        senderCandidates[senderIndex].push({ targetIndex: slotIndex, cost })
      }
    }

    if (scapeTheNight && worldNightConfig.activeMode === 2 && nightUnknownTargetKeys.size > 0) {
      throw buildUnknownNightError(nightUnknownTargetKeys.size)
    }

    const optimizedResult = solveMinCostMaxFlow({
      senderCandidates,
      requestedQtyByIndex: Array.from({ length: slotList.length }, () => 1),
      timeoutMs: optimizedTimeoutMs
    })
    const assignmentBySenderIndex = Array.isArray(optimizedResult?.assignmentBySenderIndex)
      ? optimizedResult.assignmentBySenderIndex
      : []

    const localNoTimeList = []
    const localUnusedByQuota = []
    const assignedEntriesByTargetIndex = Array.from({ length: orderedTargets.length }, () => [])

    for (let senderIndex = 0; senderIndex < orderedSenders.length; senderIndex += 1) {
      const sender = orderedSenders[senderIndex]
      const assignedSlotRaw = assignmentBySenderIndex[senderIndex]
      const assignedSlotIndex = assignedSlotRaw == null ? null : Number(assignedSlotRaw)
      const assignedSlot = Number.isFinite(assignedSlotIndex) && assignedSlotIndex >= 0
        ? slotList[assignedSlotIndex]
        : null
      const assignedTargetIndex = Number(assignedSlot?.targetIndex)
      if (assignedSlot && Number.isFinite(assignedTargetIndex) && assignedTargetIndex >= 0 && assignedTargetIndex < localRemainingQtyByIndex.length) {
        if ((localRemainingQtyByIndex[assignedTargetIndex] || 0) > 0) {
          assignedEntriesByTargetIndex[assignedTargetIndex]?.push?.({
            sender,
            round: Number.isFinite(Number(assignedSlot?.round)) ? Number(assignedSlot.round) : 0,
            slotIndex: Number.isFinite(Number(assignedSlot?.slotIndex)) ? Number(assignedSlot.slotIndex) : null,
            sendOffsetMs: Number.isFinite(Number(assignedSlot?.sendOffsetMs)) ? Number(assignedSlot.sendOffsetMs) : null
          })
          localRemainingQtyByIndex[assignedTargetIndex] = Math.max(0, Number(localRemainingQtyByIndex[assignedTargetIndex] || 0) - 1)
          continue
        }
      }
      const senderState = senderStates[senderIndex] || {}
      const senderCandidateList = Array.isArray(senderCandidates[senderIndex]) ? senderCandidates[senderIndex] : []
      if (
        senderState.hadCandidateWithQty
        && scapeTheNight
        && senderState.hadNightReject
        && !senderState.hadUnknownNight
        && senderCandidateList.length === 0
      ) {
        localNoTimeList.push(sender)
      } else {
        localUnusedByQuota.push(sender)
      }
    }

    assignedEntriesByTargetIndex.forEach((entries, targetIndex) => {
      const sortedEntries = (Array.isArray(entries) ? entries : [])
        .sort((a, b) => {
          const slotA = Number.isFinite(Number(a?.slotIndex)) ? Number(a.slotIndex) : Infinity
          const slotB = Number.isFinite(Number(b?.slotIndex)) ? Number(b.slotIndex) : Infinity
          if (slotA !== slotB) return slotA - slotB
          const roundA = Number.isFinite(Number(a?.round)) ? Number(a.round) : 0
          const roundB = Number.isFinite(Number(b?.round)) ? Number(b.round) : 0
          return roundA - roundB
        })
      targetGroups[targetIndex].senders = sortedEntries.map((entry) => entry?.sender).filter(Boolean)
    })

    const commandEntries = assignedEntriesByTargetIndex
      .flatMap((entries, targetIndex) => {
        return (Array.isArray(entries) ? entries : []).map((entry) => ({
          targetIndex,
          round: Number.isFinite(Number(entry?.round)) ? Number(entry.round) : 0,
          target: orderedTargets[targetIndex] || null,
          source: entry?.sender || null,
          dispatchOrder: Number.isFinite(Number(entry?.slotIndex)) ? Number(entry.slotIndex) : null,
          sendOffsetMs: Number.isFinite(Number(entry?.sendOffsetMs)) ? Number(entry.sendOffsetMs) : null
        }))
      })
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a?.dispatchOrder)) ? Number(a.dispatchOrder) : Infinity
        const orderB = Number.isFinite(Number(b?.dispatchOrder)) ? Number(b.dispatchOrder) : Infinity
        if (orderA !== orderB) return orderA - orderB
        if (a.round !== b.round) return a.round - b.round
        return a.targetIndex - b.targetIndex
      })

    return {
      noTimeList: localNoTimeList,
      unusedByQuota: localUnusedByQuota,
      remainingQtyByIndex: localRemainingQtyByIndex,
      commandEntries,
      optimizedMeta: {
        timeoutMs: optimizedTimeoutMs,
        dispatchPerCommandMs: optimizedDispatchPerCommandMs,
        flow: Number(optimizedResult?.flow) || 0,
        cost: Number(optimizedResult?.cost) || 0
      }
    }
  }

  let usedDistributionMode = requestedDistributionMode
  let fallbackMeta = null
  let executionResult = null

  if (requestedDistributionMode === 'min_cost_max_flow') {
    try {
      executionResult = runOptimizedDistribution()
    } catch (error) {
      if (String(error?.code || '') === 'BN_UNKNOWN_PLAYER_NIGHT') throw error
      usedDistributionMode = 'sender_first'
      fallbackMeta = {
        from: 'min_cost_max_flow',
        to: 'sender_first',
        code: String(error?.code || 'DISTRIBUTION_OPTIMIZED_ERROR'),
        message: String(error?.message || 'Erro no motor otimizado')
      }
      executionResult = runSenderFirstDistribution()
    }
  } else {
    executionResult = runSenderFirstDistribution()
  }

  const noTimeList = Array.isArray(executionResult?.noTimeList) ? executionResult.noTimeList : []
  const unusedByQuota = Array.isArray(executionResult?.unusedByQuota) ? executionResult.unusedByQuota : []
  const commandEntries = Array.isArray(executionResult?.commandEntries)
    ? executionResult.commandEntries
    : buildCommandEntriesFromTargetGroups(targetGroups)

  const assignedSenders = targetGroups.flatMap((group) => group.senders)
  targetGroups.forEach((group) => {
    group.assignedQty = Array.isArray(group?.senders) ? group.senders.length : 0
    group.remainingQty = Math.max(0, Number(group?.requestedQty || 0) - Number(group?.assignedQty || 0))
  })
  const unfilledRequestedCount = targetGroups.reduce((sum, group) => {
    return sum + Math.max(0, Number(group?.remainingQty || 0))
  }, 0)

  return {
    mode: 'send',
    typeGenerate,
    scapeTheNight,
    baseSendMs,
    sendConfirmBufferMs,
    timezoneOffsetMinutes,
    nightStartLeadMs,
    nightStartLeadMinutes,
    nightOffsetToleranceMinutes,
    slowestUnit,
    slowestUnitSecondsPerField,
    orderedTargets,
    orderedSenders,
    targetGroups,
    commandEntries,
    noTimeList,
    unusedByQuota,
    assignedSenders,
    meta: {
      totalTargets: orderedTargets.length,
      totalSenders: orderedSenders.length,
      requestedCount: requestedCommandsCount,
      assignedCount: assignedSenders.length,
      noTimeCount: noTimeList.length,
      unusedByQuotaCount: unusedByQuota.length,
      unfilledRequestedCount,
      nightUnknownCount: nightUnknownTargetKeys.size,
      nightStartLeadMs,
      requestedDistributionMode,
      usedDistributionMode,
      fallbackApplied: Boolean(fallbackMeta),
      fallbackMeta,
      optimizedMeta: executionResult?.optimizedMeta || null
    }
  }
}

export default mineDistribution
