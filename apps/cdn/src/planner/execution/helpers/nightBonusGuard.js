import { useGoTiming } from "../../../hooks/useGoTiming";
import { appendExecutionLog, createExecutionLogEntry } from "../../../send/utils";

function parseFiniteNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseNightBonusHour(value) {
  const parsed = parseFiniteNumber(value)
  if (parsed == null) return null
  if (parsed === 24) return 0
  return Math.max(0, Math.min(23, Math.floor(parsed)))
}

function parseNightBonusActiveMode(value) {
  if (typeof value === 'boolean') return value ? 1 : 0
  const parsed = parseFiniteNumber(value)
  return parsed == null ? null : Math.max(0, Math.floor(parsed))
}

function normalizePlayerId(value) {
  const parsed = parseFiniteNumber(value)
  if (parsed == null || parsed <= 0) return null
  return Math.trunc(parsed)
}

function parseTargetPlayerIdState(plannerTarget = null, context = {}) {
  const rawValue = (
    plannerTarget?.playerId ??
    plannerTarget?.player_id ??
    plannerTarget?.owner ??
    context?.targetPlayerId
  )
  if (rawValue == null || rawValue === '') return { playerId: null, explicitBarbarian: false, missing: true }
  const parsed = parseFiniteNumber(rawValue)
  if (parsed == null) return { playerId: null, explicitBarbarian: false, missing: true }
  if (parsed === 0) return { playerId: null, explicitBarbarian: true, missing: false }
  if (parsed < 0) return { playerId: null, explicitBarbarian: false, missing: true }
  return {
    playerId: Math.trunc(parsed),
    explicitBarbarian: false,
    missing: false
  }
}

function normalizeNightBonusConfig(config = null) {
  const startHour = parseNightBonusHour(
    config?.startHour ??
    config?.start_hour ??
    config?.start
  )
  const endHour = parseNightBonusHour(
    config?.endHour ??
    config?.end_hour ??
    config?.end
  )
  const activeModeRaw = parseNightBonusActiveMode(
    config?.activeMode ??
    config?.active ??
    config?.enabled ??
    config?.isActive
  )
  const hasWindow = startHour != null && endHour != null
  const activeMode = activeModeRaw == null ? (hasWindow ? 1 : 0) : activeModeRaw
  const active = activeMode > 0
  return { active, activeMode, startHour, endHour }
}

function buildPlayerNightMoralStateMap(list = []) {
  const map = new Map()
  ;(Array.isArray(list) ? list : []).forEach((item) => {
    const playerId = normalizePlayerId(item?.playerId)
    if (!playerId) return
    map.set(playerId, {
      playerId,
      night: normalizeNightBonusConfig(item?.night || null),
      morale: parseFiniteNumber(item?.moral ?? item?.morale)
    })
  })
  return map
}

function resolveNightBonusConfigForTarget({ context = {}, plannerTarget = null } = {}) {
  const worldNight = normalizeNightBonusConfig(context?.worldNightConfig ?? null)
  if (!worldNight.active || worldNight.startHour == null || worldNight.endHour == null) {
    const fallback = normalizeNightBonusConfig(context?.nightBonusConfig)
    if (fallback.active && fallback.startHour != null && fallback.endHour != null) {
      return { config: fallback, unknown: false, source: 'legacy-context' }
    }
    return { config: worldNight, unknown: false, source: 'world-inactive' }
  }
  if (worldNight.activeMode !== 2) {
    return { config: worldNight, unknown: false, source: 'world' }
  }
  const { playerId, explicitBarbarian, missing } = parseTargetPlayerIdState(plannerTarget, context)
  if (explicitBarbarian) {
    return { config: worldNight, unknown: false, source: 'barbarian-fallback' }
  }
  if (missing || !playerId) {
    return { config: null, unknown: true, source: 'unknown-target-player' }
  }
  const stateMap = buildPlayerNightMoralStateMap(context?.playerNightMoralState)
  const playerState = stateMap.get(playerId)
  const playerNight = normalizeNightBonusConfig(playerState?.night || null)
  if (playerNight.active && playerNight.startHour != null && playerNight.endHour != null) {
    return { config: playerNight, unknown: false, source: 'player-state' }
  }
  const fallback = normalizeNightBonusConfig(context?.nightBonusConfig)
  if (fallback.active && fallback.startHour != null && fallback.endHour != null) {
    return { config: fallback, unknown: true, source: 'legacy-fallback' }
  }
  return { config: null, unknown: true, source: 'unknown' }
}

function isNightBonusAt(arrivalMs, config = null) {
  const arrival = Number(arrivalMs)
  if (!Number.isFinite(arrival)) return false
  const normalized = normalizeNightBonusConfig(config)
  if (!normalized.active || normalized.startHour == null || normalized.endHour == null) return false
  const startMin = normalized.startHour * 60
  const endMin = normalized.endHour * 60
  if (startMin === endMin) return false
  const date = new Date(arrival)
  const currentMin = date.getHours() * 60 + date.getMinutes()
  if (startMin < endMin) return currentMin >= startMin && currentMin < endMin
  return currentMin >= startMin || currentMin < endMin
}

function shouldGuardNightBonus(context = {}) {
  if (context?.skipNightBonusGuard) return false
  const commandModeRaw = String(context?.commandType || context?.templateStats?.template?.commandMode || '').trim().toLowerCase()
  const commandType = commandModeRaw === 'support' ? 'support' : 'attack'
  if (commandType !== 'attack') return false
  return Boolean(context?.executeConfirmOptions?.scapeTheNight)
}

function formatArrivalTimePtBr(ms) {
  const value = Number(ms)
  if (!Number.isFinite(value)) return ''
  try {
    return new Date(value).toLocaleString('pt-BR')
  } catch (_) {
    return String(value)
  }
}

export function applyNightBonusGuardAfterConfirm({
  preparedQueue = [],
  context = {},
  plannerTarget = null,
  view
} = {}) {
  if (!shouldGuardNightBonus(context)) {
    return {
      enabled: false,
      blockedCount: 0,
      inspectedCount: 0,
      unknownCount: 0
    }
  }

  const nightResolution = resolveNightBonusConfigForTarget({ context, plannerTarget })
  const worldNightConfig = normalizeNightBonusConfig(context?.worldNightConfig ?? null)
  if (nightResolution?.unknown && worldNightConfig.activeMode === 2) {
    throw new Error('BN (active=2): night do player alvo não resolvido. Envio cancelado para garantir "Escapar BN".')
  }
  const nightBonusConfig = normalizeNightBonusConfig(nightResolution?.config)
  if (nightResolution?.unknown && (!nightBonusConfig.active || nightBonusConfig.startHour == null || nightBonusConfig.endHour == null)) {
    const queue = Array.isArray(preparedQueue) ? preparedQueue : []
    const inspectedCount = queue.filter((queueItem) => {
      const resultItem = queueItem?.resultItem
      return Boolean(resultItem?.confirmOk) && !resultItem?.sendOk && !resultItem?.error
    }).length
    return {
      enabled: true,
      activeWindow: false,
      blockedCount: 0,
      inspectedCount,
      unknownCount: inspectedCount
    }
  }
  if (!nightBonusConfig.active || nightBonusConfig.startHour == null || nightBonusConfig.endHour == null) {
    return {
      enabled: true,
      activeWindow: false,
      blockedCount: 0,
      inspectedCount: 0,
      unknownCount: 0
    }
  }

  let inspectedCount = 0
  let blockedCount = 0
  let unknownCount = 0
  const queue = Array.isArray(preparedQueue) ? preparedQueue : []

  queue.forEach((queueItem, index) => {
    const resultItem = queueItem?.resultItem
    if (!resultItem?.confirmOk) return
    if (resultItem?.sendOk) return
    if (resultItem?.error) return
    inspectedCount += 1

    const confirmDurationSecond = Number(
      resultItem?.confirmDurationSecond ??
      resultItem?.result?.confirm?.durationSecond ??
      resultItem?.slowestDurationSeconds ??
      resultItem?.result?.source?.slowestDurationSeconds
    )
    if (!Number.isFinite(confirmDurationSecond) || confirmDurationSecond <= 0) {
      unknownCount += 1
      return
    }

    const confirmAtMs = Number(resultItem?.confirmAtMs)
    const nowMs = Number.isFinite(confirmAtMs) && confirmAtMs > 0
      ? confirmAtMs
      : Number(useGoTiming?.getServerNowMs?.() || Date.now())
    const arrivalMs = nowMs + (Math.floor(confirmDurationSecond) * 1000)
    if (!isNightBonusAt(arrivalMs, nightBonusConfig)) return

    blockedCount += 1
    resultItem.ok = false
    resultItem.sendOk = false
    resultItem.blockedByNightBonus = true
    resultItem.error = `Bloqueado por BN (chegada ${formatArrivalTimePtBr(arrivalMs)}).`

    const senderVillageId = Number(queueItem?.sender?.villageId)
    const targetX = Number(plannerTarget?.x)
    const targetY = Number(plannerTarget?.y)
    appendExecutionLog(
      createExecutionLogEntry({
        mode: 'send',
        phase: 'phase2.5',
        status: 'warn',
        villageId: Number.isFinite(senderVillageId) ? senderVillageId : undefined,
        target: (Number.isFinite(targetX) && Number.isFinite(targetY))
          ? { x: targetX, y: targetY }
          : undefined,
        message: 'Envio bloqueado por regra de bônus noturno após confirmação (fase 2).',
        meta: {
          confirmDurationSecond: Math.floor(confirmDurationSecond),
          arrivalMs,
          queueIndex: index
        }
      })
    )

    view?.feedUpsert?.({
      id: queueItem?.execId || `send:bn:${index}`,
      status: 'error',
      title: queueItem?.title || 'Comando',
      detail: `Bloqueado por BN | chegada em bônus noturno (${Math.floor(confirmDurationSecond)}s)`,
      finalStatus: true
    })
  })

  if (blockedCount > 0) {
    view?.info?.(`BN: ${blockedCount} envio(s) bloqueado(s) após confirmação.`, 3500)
  }

  return {
    enabled: true,
    activeWindow: true,
    blockedCount,
    inspectedCount,
    unknownCount
  }
}
