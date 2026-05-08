/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import {
  EXECUTION_KINDS,
  EXECUTION_STATUSES,
} from '../controller/contract'
import {
  getRunnerControllerScopeState,
  reconcileScopeTrackedInstructions,
  syncControllerScopeAlarm,
} from '../controller/runner-controller'
import { handleScriptExecutionSync } from '../controller/runtime'
import {
  buildControllerExecutionDocumentId,
  getAllControllerExecutionDocuments,
  getControllerExecutionDocument,
  type ControllerExecutionDocument,
} from '../controller/storage'
import {
  getAllScriptStorageDocuments,
  type ScriptStorageDocument,
} from '../indexdb/script-storage'
import {
  FARM_CONFIG_CHANGED_MESSAGE_TYPE,
  FARM_STATE_CHANGED_MESSAGE_TYPE,
  RUNNER_EXECUTION_REPORT_MESSAGE_TYPE,
} from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import {
  ensurePreparedContextLoaded,
  getScopeFromUrl,
  getTabContext,
  getTabIdsByWorldPlayer,
} from '../prepared-context'
import {
  ensureWorldPlayersLoaded,
  getWorldPlayer,
} from '../world-players'
import {
  clearFarmMaxOwnerAlarm,
  parseFarmMaxOwnerAlarmName,
  scheduleFarmMaxOwnerAlarm,
} from './alarm'
import {
  normalizeFarmConfig,
  normalizeFarmSchedule,
  putFarmConfigData,
  putFarmScheduleData,
  readFarmStorage,
  type FarmConfigState,
  type FarmStorageContext,
  type FarmScheduleState,
} from './storage'

type FarmMessageRequest = Partial<SWMessage> & {
  world?: unknown
  t?: unknown
  playerId?: unknown
}

type RunnerExecutionReportStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

type RunnerExecutionReportRequest = Partial<SWMessage> & {
  status?: unknown
  execution?: unknown
  snapshot?: unknown
}

type FarmOwnerContext = {
  ownerKey: string
  world: string
  playerId: number
}

type FarmExecutionContext = FarmOwnerContext & {
  scopeKey: string | null
  t: number | null
}

type ReconcileFarmMaxOptions = {
  reason?: string
  source?: string
  scheduleFailureFallback?: boolean
  advanceSeasonAnchorOnEmptyQueue?: boolean
}

type ImmediateFarmExecution = {
  kind: string
  machine: string
  reason: string
}

type ControllerExecutionInput = {
  kind: string
  status: string
  nextAt: number
  payload: {
    machine: string
    data: Record<string, unknown>
  }
  reason: string
}

type DesiredFarmPlan = {
  immediate: ImmediateFarmExecution | null
  ownerAlarmAt: number | null
  allowedPendingMachines: string[]
  stopCurrentMachines: string[]
  state: 'inactive' | 'handler-now' | 'schedule-now' | 'schedule-future' | 'waiting-scope'
}

type DesiredFarmControllerExecution = {
  compose: Record<string, unknown>
  execution: ControllerExecutionInput
}

type FarmMaxPlannedNext = {
  at: number
  kind: string
  machine: string
  ownerKey: string
  reason: string
  source: 'farm-max'
}

const FARM_HANDLER_RUNTIME = 'farm-handler'
const FARM_SCHEDULES_RUNTIME = 'farm-schedules'
const FARM_TRACKED_RUNTIMES = [
  FARM_HANDLER_RUNTIME,
  FARM_SCHEDULES_RUNTIME,
]
const FARM_SCOPE_RETRY_MS = 30_000

let farmMaxInitialized = false

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function createScopeKey(world: string | null, t: number | null) {
  if (!world) {
    return null
  }

  return `${world}:${t ?? 'main'}`
}

function createFarmOwnerKey(world: string, playerId: number) {
  return `${world}:${playerId}`
}

function parseFarmOwnerKey(ownerKey?: string | null) {
  const normalizedOwnerKey = normalizeString(ownerKey)

  if (!normalizedOwnerKey) {
    return null
  }

  const [world, rawPlayerId] = normalizedOwnerKey.split(':')
  const playerId = normalizeNumber(Number(rawPlayerId))

  if (!world || playerId === null) {
    return null
  }

  return {
    ownerKey: normalizedOwnerKey,
    world,
    playerId,
  } satisfies FarmOwnerContext
}

function parseScopeT(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return null
  }

  const [, rawT] = normalizedScopeKey.split(':')

  if (!rawT || rawT === 'main') {
    return null
  }

  return normalizeNumber(Number(rawT))
}

function getNowSeconds() {
  return Math.round(Date.now() / 1000)
}

function buildFarmScheduleExecutionCompose(context: FarmExecutionContext) {
  if (!context.scopeKey) {
    return null
  }

  return {
    scopeKey: context.scopeKey,
    world: context.world,
    t: context.t,
    playerId: context.playerId,
    path: ['farm-max', 'schedule'],
  }
}

function buildFarmHandlerExecutionCompose(context: FarmExecutionContext) {
  if (!context.scopeKey) {
    return null
  }

  return {
    scopeKey: context.scopeKey,
    world: context.world,
    t: context.t,
    playerId: context.playerId,
    path: ['farm-max', 'handler'],
  }
}

function createQueuedExecution({
  kind,
  machine,
  reason,
}: {
  kind: string
  machine: string
  reason: string
}) {
  return {
    kind,
    status: EXECUTION_STATUSES.QUEUED,
    nextAt: Date.now(),
    payload: {
      machine,
      data: {},
    },
    reason,
  } satisfies ControllerExecutionInput
}

function serializeComparableExecution(value: unknown) {
  const execution = asRecord(value)
  const payload = asRecord(execution?.payload)

  return JSON.stringify({
    kind: normalizeString(execution?.kind) ?? null,
    status: normalizeString(execution?.status) ?? null,
    nextAt: normalizeNumber(execution?.nextAt),
    reason: normalizeString(execution?.reason) ?? null,
    payload: payload
      ? {
        machine: normalizeString(payload.machine) ?? null,
        data: asRecord(payload.data) ?? null,
      }
      : null,
  })
}

function isEquivalentImmediateExecution(
  previousExecution: unknown,
  nextExecution: ControllerExecutionInput,
) {
  const previous = asRecord(previousExecution)
  const previousPayload = asRecord(previous?.payload)
  const nextPayload = asRecord(nextExecution.payload)
  const previousNextAt = normalizeNumber(previous?.nextAt)
  const nextNextAt = normalizeNumber(nextExecution.nextAt)
  const now = Date.now()

  if (previousNextAt === null || nextNextAt === null) {
    return false
  }

  if (previousNextAt > now || nextNextAt > now) {
    return false
  }

  return JSON.stringify({
    kind: normalizeString(previous?.kind) ?? null,
    status: normalizeString(previous?.status) ?? null,
    reason: normalizeString(previous?.reason) ?? null,
    payload: previousPayload
      ? {
        machine: normalizeString(previousPayload.machine) ?? null,
        data: asRecord(previousPayload.data) ?? null,
      }
      : null,
  }) === JSON.stringify({
    kind: nextExecution.kind,
    status: nextExecution.status,
    reason: nextExecution.reason,
    payload: nextPayload
      ? {
        machine: normalizeString(nextPayload.machine) ?? null,
        data: asRecord(nextPayload.data) ?? null,
      }
      : null,
  })
}

function hasFarmScheduleValues(schedule: FarmScheduleState) {
  return Array.isArray(schedule.values) && schedule.values.length > 0
}

function isLimitSeason({
  config,
  schedule,
  nowSeconds,
}: {
  config: FarmConfigState
  schedule: FarmScheduleState
  nowSeconds: number
}) {
  if (!config.last && !schedule.timegenerate) {
    return true
  }

  if (hasFarmScheduleValues(schedule)) {
    return false
  }

  const limit = (config.last || schedule.timegenerate) + (config.season * 60)

  return limit < nowSeconds
}

function isLimitGenerate({
  config,
  schedule,
  nowSeconds,
}: {
  config: FarmConfigState
  schedule: FarmScheduleState
  nowSeconds: number
}) {
  const limit = (
    (config.season * 60)
    + (config.maxVillages * 60)
    + schedule.timegenerate
  )

  return limit < nowSeconds
}

function resolveNextSeasonAtMs({
  config,
  schedule,
}: {
  config: FarmConfigState
  schedule: FarmScheduleState
}) {
  const anchorSeconds = config.last || schedule.timegenerate

  return (anchorSeconds + (config.season * 60)) * 1000
}

function createInactivePlan() {
  return {
    immediate: null,
    ownerAlarmAt: null,
    allowedPendingMachines: [],
    stopCurrentMachines: [...FARM_TRACKED_RUNTIMES],
    state: 'inactive',
  } satisfies DesiredFarmPlan
}

function createHandlerNowPlan() {
  return {
    immediate: {
      kind: EXECUTION_KINDS.MAIN,
      machine: FARM_HANDLER_RUNTIME,
      reason: 'farm-handler:queue-available',
    },
    ownerAlarmAt: null,
    allowedPendingMachines: [FARM_HANDLER_RUNTIME],
    stopCurrentMachines: [],
    state: 'handler-now',
  } satisfies DesiredFarmPlan
}

function createScheduleNowPlan() {
  return {
    immediate: {
      kind: EXECUTION_KINDS.SCHEDULED,
      machine: FARM_SCHEDULES_RUNTIME,
      reason: 'farm-schedules:season-due',
    },
    ownerAlarmAt: null,
    allowedPendingMachines: [FARM_SCHEDULES_RUNTIME],
    stopCurrentMachines: [],
    state: 'schedule-now',
  } satisfies DesiredFarmPlan
}

function createScheduleFuturePlan({
  nextAt,
  reason: _reason,
}: {
  nextAt: number
  reason: string
}) {
  return {
    immediate: null,
    ownerAlarmAt: nextAt,
    allowedPendingMachines: [],
    stopCurrentMachines: [],
    state: 'schedule-future',
  } satisfies DesiredFarmPlan
}

function createWaitingScopePlan({
  immediate,
  allowedPendingMachines = [],
}: {
  immediate: ImmediateFarmExecution
  allowedPendingMachines?: string[]
}) {
  const state = immediate.machine === FARM_HANDLER_RUNTIME
    ? 'handler-now'
    : 'schedule-now'

  return {
    immediate,
    ownerAlarmAt: Date.now() + FARM_SCOPE_RETRY_MS,
    allowedPendingMachines,
    stopCurrentMachines: [],
    state: 'waiting-scope',
  } satisfies DesiredFarmPlan
}

function isFarmControllerDocument(
  document: ControllerExecutionDocument,
) {
  const path = Array.isArray(document.compose?.path)
    ? document.compose.path
    : []
  const payload = asRecord(document.execution?.payload)
  const machine = normalizeString(payload?.machine)
  const isLegacyFarmPath = path.length === 1 && (
    path[0] === FARM_SCHEDULES_RUNTIME
    || path[0] === FARM_HANDLER_RUNTIME
  )
  const isFarmMachine = machine === FARM_SCHEDULES_RUNTIME || machine === FARM_HANDLER_RUNTIME

  return (
    path[0] === 'farm-max'
    || isLegacyFarmPath
    || isFarmMachine
  )
}

function isFarmControllerDocumentForOwner(
  document: ControllerExecutionDocument,
  owner: FarmOwnerContext,
) {
  const world = normalizeString(document.compose?.world)
  const playerId = normalizeNumber(document.compose?.playerId)

  return isFarmControllerDocument(document)
    && world === owner.world
    && playerId === owner.playerId
}

function getDocumentScopeKey(document: ControllerExecutionDocument) {
  return normalizeString(
    document.execution?.scope?.scopeKey
    ?? document.compose.scopeKey,
  )
}

async function syncDesiredExecution({
  compose,
  execution,
  silent = false,
}: {
  compose: Record<string, unknown>
  execution: ControllerExecutionInput | null
  silent?: boolean
}) {
  const previous = await getControllerExecutionDocument(compose)

  if (!execution) {
    if (!previous) {
      return {
        ok: true,
        skipped: true,
      }
    }

    return await handleScriptExecutionSync({
      action: 'delete',
      compose,
      silent,
    })
  }

  if (
    previous?.execution
    && (
      serializeComparableExecution(previous.execution) === serializeComparableExecution(execution)
      || isEquivalentImmediateExecution(previous.execution, execution)
    )
  ) {
    return {
      ok: true,
      skipped: true,
      compose,
      document: previous,
    }
  }

  return await handleScriptExecutionSync({
    action: 'upsert',
    compose,
    execution,
    silent,
  })
}

async function resolveScopeKeyForWorldPlayer({
  world,
  playerId,
}: FarmStorageContext) {
  const tabIds = getTabIdsByWorldPlayer(world, playerId)

  for (const tabId of tabIds) {
    const tabContext = getTabContext(tabId)
    const scopeKey = normalizeString(tabContext?.scopeKey)

    if (scopeKey) {
      return scopeKey
    }
  }

  return normalizeString(getWorldPlayer(world, playerId)?.scopeKey)
}

async function resolveFarmOwnerContext(
  request: FarmMessageRequest = {},
  sender?: chrome.runtime.MessageSender,
): Promise<FarmOwnerContext | null> {
  await ensurePreparedContextLoaded()
  await ensureWorldPlayersLoaded()

  const tabContext = getTabContext(sender?.tab?.id ?? null)
  const senderScope = getScopeFromUrl(sender?.tab?.url ?? sender?.url ?? null)
  const world = (
    normalizeString(request.world)
    ?? tabContext?.world
    ?? senderScope?.world
    ?? null
  )
  const playerId = normalizeNumber(request.playerId) ?? tabContext?.playerId ?? null

  if (!world || playerId === null) {
    return null
  }

  return {
    ownerKey: createFarmOwnerKey(world, playerId),
    world,
    playerId,
  }
}

async function resolveFarmExecutionContext(
  owner: FarmOwnerContext,
  {
    preferredScopeKey = null,
    preferredT = null,
    senderTabId = null,
  }: {
    preferredScopeKey?: string | null
    preferredT?: number | null
    senderTabId?: number | null
  } = {},
): Promise<FarmExecutionContext> {
  await ensurePreparedContextLoaded()
  await ensureWorldPlayersLoaded()

  const senderTabContext = getTabContext(senderTabId)
  const senderScopeKey = (
    senderTabContext?.world === owner.world
    && senderTabContext?.playerId === owner.playerId
  )
    ? normalizeString(senderTabContext.scopeKey)
    : null
  const scopeKey = (
    normalizeString(preferredScopeKey)
    ?? senderScopeKey
    ?? await resolveScopeKeyForWorldPlayer(owner)
  ) ?? null

  return {
    ownerKey: owner.ownerKey,
    world: owner.world,
    playerId: owner.playerId,
    scopeKey,
    t: normalizeNumber(preferredT)
      ?? (scopeKey ? parseScopeT(scopeKey) : null),
  }
}

async function clearFarmScheduleValues(
  context: FarmStorageContext,
  schedule: FarmScheduleState,
) {
  const nextData = {
    ...schedule.data,
    count: 1,
    total: 0,
    values: [],
  }

  const document = await putFarmScheduleData(context, nextData)

  return normalizeFarmSchedule(document?.data)
}

async function updateFarmLast(
  context: FarmStorageContext,
  config: FarmConfigState,
  last: number,
) {
  const nextData = {
    ...config.data,
    last,
  }

  const document = await putFarmConfigData(context, nextData)

  return normalizeFarmConfig(document?.data)
}

function buildDesiredFarmPlan({
  config,
  schedule,
  nowSeconds,
  scheduleFailureFallback,
  advanceSeasonAnchorOnEmptyQueue,
}: {
  config: FarmConfigState
  schedule: FarmScheduleState
  nowSeconds: number
  scheduleFailureFallback: boolean
  advanceSeasonAnchorOnEmptyQueue: boolean
}) {
  if (!config.active) {
    return createInactivePlan()
  }

  if (hasFarmScheduleValues(schedule)) {
    if (isLimitGenerate({ config, schedule, nowSeconds })) {
      return {
        type: 'generate-limit',
      } as const
    }

    return createHandlerNowPlan()
  }

  if (scheduleFailureFallback) {
    return {
      type: 'retry-failure',
    } as const
  }

  if (advanceSeasonAnchorOnEmptyQueue) {
    return {
      type: 'advance-empty-queue',
    } as const
  }

  if (isLimitSeason({ config, schedule, nowSeconds })) {
    return createScheduleNowPlan()
  }

  return createScheduleFuturePlan({
    nextAt: resolveNextSeasonAtMs({
      config,
      schedule,
    }),
    reason: 'farm-schedules:wait-season',
  })
}

function buildImmediateFarmControllerExecution(
  context: FarmExecutionContext,
  immediate: ImmediateFarmExecution,
) {
  if (!context.scopeKey) {
    return null
  }

  const compose = immediate.machine === FARM_HANDLER_RUNTIME
    ? buildFarmHandlerExecutionCompose(context)
    : buildFarmScheduleExecutionCompose(context)

  if (!compose) {
    return null
  }

  return {
    compose,
    execution: createQueuedExecution({
      kind: immediate.kind,
      machine: immediate.machine,
      reason: immediate.reason,
    }),
  } satisfies DesiredFarmControllerExecution
}

async function getFarmControllerDocumentsForOwner(owner: FarmOwnerContext) {
  const documents = await getAllControllerExecutionDocuments()

  return documents.filter((document) => isFarmControllerDocumentForOwner(document, owner))
}

async function cleanupFarmControllerExecutionsForOwner(
  owner: FarmOwnerContext,
  {
    keepDocumentIds = [],
    silent = true,
  }: {
    keepDocumentIds?: string[]
    silent?: boolean
  } = {},
) {
  const documents = await getFarmControllerDocumentsForOwner(owner)
  const keepSet = new Set(keepDocumentIds)
  const affectedScopeKeys = new Set<string>()

  for (const document of documents) {
    if (keepSet.has(document._id)) {
      continue
    }

    const scopeKey = getDocumentScopeKey(document)

    if (scopeKey) {
      affectedScopeKeys.add(scopeKey)
    }

    await handleScriptExecutionSync({
      action: 'delete',
      compose: document.compose,
      silent,
    })
  }

  return affectedScopeKeys
}

async function syncFarmControllerExecution(
  desired: DesiredFarmControllerExecution | null,
  {
    silent,
  }: {
    silent: boolean
  },
) {
  if (!desired) {
    return null
  }

  return await syncDesiredExecution({
    compose: desired.compose,
    execution: desired.execution,
    silent,
  })
}

async function syncAffectedControllerScopeAlarms(scopeKeys: Iterable<string>) {
  for (const scopeKey of scopeKeys) {
    await syncControllerScopeAlarm(scopeKey)
  }
}

async function reconcileFarmMaxOwner(
  owner: FarmOwnerContext,
  {
    reason = 'farm-max-reconcile',
    source = 'farm-max',
    scheduleFailureFallback = false,
    advanceSeasonAnchorOnEmptyQueue = false,
    preferredScopeKey = null,
    preferredT = null,
    senderTabId = null,
  }: ReconcileFarmMaxOptions & {
    preferredScopeKey?: string | null
    preferredT?: number | null
    senderTabId?: number | null
  } = {},
) {
  const storageContext = {
    world: owner.world,
    playerId: owner.playerId,
  } satisfies FarmStorageContext
  const executionContext = await resolveFarmExecutionContext(owner, {
    preferredScopeKey,
    preferredT,
    senderTabId,
  })
  const nowSeconds = getNowSeconds()
  const controllerScopeState = executionContext.scopeKey
    ? getRunnerControllerScopeState(executionContext.scopeKey)
    : null
  const shouldSyncSilently = normalizeString(controllerScopeState?.current?.machine) !== null

  let {
    config,
    schedule,
  } = await readFarmStorage(storageContext)

  const rawPlan = buildDesiredFarmPlan({
    config,
    schedule,
    nowSeconds,
    scheduleFailureFallback,
    advanceSeasonAnchorOnEmptyQueue,
  })

  let plan: DesiredFarmPlan

  if ('type' in rawPlan && rawPlan.type === 'generate-limit') {
    schedule = await clearFarmScheduleValues(storageContext, schedule)
    config = await updateFarmLast(storageContext, config, nowSeconds)
    plan = createScheduleFuturePlan({
      nextAt: resolveNextSeasonAtMs({
        config,
        schedule,
      }),
      reason: 'farm-schedules:next-season-after-generate-limit',
    })
  } else if ('type' in rawPlan && rawPlan.type === 'retry-failure') {
    config = await updateFarmLast(storageContext, config, nowSeconds)
    plan = createScheduleFuturePlan({
      nextAt: resolveNextSeasonAtMs({
        config,
        schedule,
      }),
      reason: 'farm-schedules:retry-after-failure',
    })
  } else if ('type' in rawPlan && rawPlan.type === 'advance-empty-queue') {
    config = await updateFarmLast(storageContext, config, nowSeconds)
    plan = createScheduleFuturePlan({
      nextAt: resolveNextSeasonAtMs({
        config,
        schedule,
      }),
      reason: 'farm-schedules:next-season-after-empty-queue',
    })
  } else {
    plan = rawPlan
  }

  const desiredImmediateExecution = plan.immediate
    ? buildImmediateFarmControllerExecution(executionContext, plan.immediate)
    : null
  const effectivePlan = plan.immediate && !desiredImmediateExecution
    ? createWaitingScopePlan({
      immediate: plan.immediate,
      allowedPendingMachines: plan.allowedPendingMachines,
    })
    : plan
  const desiredDocumentId = desiredImmediateExecution
    ? buildControllerExecutionDocumentId(desiredImmediateExecution.compose)
    : null
  const affectedScopeKeys = await cleanupFarmControllerExecutionsForOwner(owner, {
    keepDocumentIds: desiredDocumentId ? [desiredDocumentId] : [],
    silent: true,
  })

  if (executionContext.scopeKey) {
    await reconcileScopeTrackedInstructions(executionContext.scopeKey, {
      trackedMachines: FARM_TRACKED_RUNTIMES,
      allowedPendingMachines: desiredImmediateExecution
        ? effectivePlan.allowedPendingMachines
        : [],
      allowedPendingExecutionIds: desiredDocumentId ? [desiredDocumentId] : [],
      stopCurrentMachines: effectivePlan.stopCurrentMachines,
      reason,
      source,
    })
  }

  for (const affectedScopeKey of affectedScopeKeys) {
    if (!affectedScopeKey || affectedScopeKey === executionContext.scopeKey) {
      continue
    }

    await reconcileScopeTrackedInstructions(affectedScopeKey, {
      trackedMachines: FARM_TRACKED_RUNTIMES,
      allowedPendingMachines: [],
      allowedPendingExecutionIds: [],
      stopCurrentMachines: FARM_TRACKED_RUNTIMES,
      reason: `${reason}:cross-scope-cleanup`,
      source,
    })
  }

  await syncFarmControllerExecution(desiredImmediateExecution, {
    silent: shouldSyncSilently,
  })

  if (desiredImmediateExecution?.compose.scopeKey) {
    affectedScopeKeys.add(String(desiredImmediateExecution.compose.scopeKey))
  }

  await syncAffectedControllerScopeAlarms(affectedScopeKeys)

  if (effectivePlan.ownerAlarmAt === null) {
    await clearFarmMaxOwnerAlarm(owner.ownerKey)
  } else {
    await scheduleFarmMaxOwnerAlarm({
      ownerKey: owner.ownerKey,
      scheduledAt: effectivePlan.ownerAlarmAt,
    })
  }

  return {
    ok: true,
    ownerKey: owner.ownerKey,
    scopeKey: executionContext.scopeKey,
    state: effectivePlan.state,
    type: source,
  }
}

function normalizeRunnerExecutionReportStatus(value: unknown): RunnerExecutionReportStatus | null {
  const status = normalizeString(value)?.toLowerCase() ?? null

  if (
    status === 'running'
    || status === 'paused'
    || status === 'stopped'
    || status === 'completed'
    || status === 'failed'
  ) {
    return status
  }

  return null
}

function extractRunnerRuntimeName(request: RunnerExecutionReportRequest) {
  const snapshot = asRecord(request.snapshot)
  const execution = asRecord(request.execution)

  return normalizeString(
    snapshot?.currentRuntimeName
    ?? execution?.currentRuntimeName,
  )
}

async function collectStoredFarmContexts() {
  const documents = await getAllScriptStorageDocuments()
  const contextsByKey = new Map<string, FarmOwnerContext>()

  documents.forEach((document: ScriptStorageDocument) => {
    const path = Array.isArray(document.compose?.path)
      ? document.compose.path
      : []
    const isFarmDocument = path.length === 1
      && (path[0] === 'config-farm' || path[0] === 'farm-schedule')
    const world = normalizeString(document.compose?.world)
    const playerId = normalizeNumber(document.compose?.playerId)

    if (!isFarmDocument || !world || playerId === null) {
      return
    }

    contextsByKey.set(createFarmOwnerKey(world, playerId), {
      ownerKey: createFarmOwnerKey(world, playerId),
      world,
      playerId,
    })
  })

  const controllerDocuments = await getAllControllerExecutionDocuments()

  controllerDocuments.forEach((document) => {
    if (!isFarmControllerDocument(document)) {
      return
    }

    const world = normalizeString(document.compose?.world)
    const playerId = normalizeNumber(document.compose?.playerId)

    if (!world || playerId === null) {
      return
    }

    contextsByKey.set(createFarmOwnerKey(world, playerId), {
      ownerKey: createFarmOwnerKey(world, playerId),
      world,
      playerId,
    })
  })

  return Array.from(contextsByKey.values())
}

export async function ensureFarmMaxInitialized() {
  if (farmMaxInitialized) {
    return
  }

  farmMaxInitialized = true

  const owners = await collectStoredFarmContexts()

  for (const owner of owners) {
    await reconcileFarmMaxOwner(owner, {
      reason: 'farm-max-startup',
      source: 'farm-max-startup',
    })
  }
}

export async function reconcileFarmMaxScope(
  context: Partial<FarmExecutionContext> = {},
  options: ReconcileFarmMaxOptions = {},
) {
  const world = normalizeString(context.world)
  const playerId = normalizeNumber(context.playerId)

  if (!world || playerId === null) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing-farm-owner-context',
    }
  }

  return await reconcileFarmMaxOwner({
    ownerKey: createFarmOwnerKey(world, playerId),
    world,
    playerId,
  }, {
    ...options,
    preferredScopeKey: normalizeString(context.scopeKey),
    preferredT: normalizeNumber(context.t),
  })
}

export async function resolveFarmMaxPlannedNext(
  context: Partial<FarmExecutionContext> = {},
): Promise<FarmMaxPlannedNext | null> {
  const world = normalizeString(context.world)
  const playerId = normalizeNumber(context.playerId)

  if (!world || playerId === null) {
    return null
  }

  const storageContext = {
    world,
    playerId,
  } satisfies FarmStorageContext
  const {
    config,
    schedule,
  } = await readFarmStorage(storageContext)
  const nowSeconds = getNowSeconds()

  if (!config.active) {
    return null
  }

  if (hasFarmScheduleValues(schedule)) {
    if (!isLimitGenerate({ config, schedule, nowSeconds })) {
      return null
    }

    return {
      at: (nowSeconds + (config.season * 60)) * 1000,
      kind: EXECUTION_KINDS.SCHEDULED,
      machine: FARM_SCHEDULES_RUNTIME,
      ownerKey: createFarmOwnerKey(world, playerId),
      reason: 'farm-schedules:next-season-after-generate-limit',
      source: 'farm-max',
    }
  }

  if (isLimitSeason({ config, schedule, nowSeconds })) {
    return null
  }

  return {
    at: resolveNextSeasonAtMs({
      config,
      schedule,
    }),
    kind: EXECUTION_KINDS.SCHEDULED,
    machine: FARM_SCHEDULES_RUNTIME,
    ownerKey: createFarmOwnerKey(world, playerId),
    reason: 'farm-schedules:wait-season',
    source: 'farm-max',
  }
}

export async function handleFarmConfigChanged(
  request: FarmMessageRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const owner = await resolveFarmOwnerContext(request, sender)

  if (!owner) {
    return {
      ok: false,
      type: FARM_CONFIG_CHANGED_MESSAGE_TYPE,
      error: 'Missing farm-max owner context',
    }
  }

  return await reconcileFarmMaxOwner(owner, {
    reason: 'farm-config-changed',
    source: FARM_CONFIG_CHANGED_MESSAGE_TYPE,
    preferredScopeKey: normalizeString(getTabContext(sender?.tab?.id ?? null)?.scopeKey),
    preferredT: normalizeNumber(request.t) ?? getTabContext(sender?.tab?.id ?? null)?.t ?? null,
    senderTabId: sender?.tab?.id ?? null,
  })
}

export async function handleFarmStateChanged(
  request: FarmMessageRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const owner = await resolveFarmOwnerContext(request, sender)

  if (!owner) {
    return {
      ok: false,
      type: FARM_STATE_CHANGED_MESSAGE_TYPE,
      error: 'Missing farm-max owner context',
    }
  }

  return await reconcileFarmMaxOwner(owner, {
    reason: 'farm-state-changed',
    source: FARM_STATE_CHANGED_MESSAGE_TYPE,
    preferredScopeKey: normalizeString(getTabContext(sender?.tab?.id ?? null)?.scopeKey),
    preferredT: normalizeNumber(request.t) ?? getTabContext(sender?.tab?.id ?? null)?.t ?? null,
    senderTabId: sender?.tab?.id ?? null,
  })
}

export async function handleFarmRunnerExecutionReport(
  request: RunnerExecutionReportRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const status = normalizeRunnerExecutionReportStatus(request.status)
  const runtimeName = extractRunnerRuntimeName(request)

  if (!status || !runtimeName || !FARM_TRACKED_RUNTIMES.includes(runtimeName)) {
    return {
      ok: true,
      skipped: true,
      type: RUNNER_EXECUTION_REPORT_MESSAGE_TYPE,
    }
  }

  if (
    status !== 'completed'
    && !(status === 'failed' && runtimeName === FARM_SCHEDULES_RUNTIME)
  ) {
    return {
      ok: true,
      skipped: true,
      type: RUNNER_EXECUTION_REPORT_MESSAGE_TYPE,
      runtimeName,
      status,
    }
  }

  const owner = await resolveFarmOwnerContext(request, sender)

  if (!owner) {
    return {
      ok: false,
      type: RUNNER_EXECUTION_REPORT_MESSAGE_TYPE,
      runtimeName,
      status,
      error: 'Missing farm-max owner context for runner report',
    }
  }

  const senderTabContext = getTabContext(sender?.tab?.id ?? null)

  return await reconcileFarmMaxOwner(owner, {
    reason: `${runtimeName}:${status}`,
    source: RUNNER_EXECUTION_REPORT_MESSAGE_TYPE,
    scheduleFailureFallback: (
      status === 'failed'
      && runtimeName === FARM_SCHEDULES_RUNTIME
    ),
    advanceSeasonAnchorOnEmptyQueue: status === 'completed',
    preferredScopeKey: normalizeString(senderTabContext?.scopeKey),
    preferredT: senderTabContext?.t ?? null,
    senderTabId: sender?.tab?.id ?? null,
  })
}

export async function handleFarmMaxAlarm(alarm: chrome.alarms.Alarm) {
  const ownerKey = parseFarmMaxOwnerAlarmName(alarm?.name)
  const owner = parseFarmOwnerKey(ownerKey)

  if (!owner) {
    return
  }

  await reconcileFarmMaxOwner(owner, {
    reason: 'farm-max-alarm-fired',
    source: 'farm-max-alarm',
  })
}
