/// <reference types="chrome" />

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { RUNNER_CONTROLLER_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import {
  ensurePreparedContextLoaded,
  getPreparedContextScopeKeys,
  getTabContext,
  getTabContextsByScopeKey,
} from '../prepared-context'
import {
  clearReconnectRuntimeActive,
  clearReconnectRuntimeActiveOnGameReturn,
  ensureReconnectRuntimeLongRestAnchor,
  ensureReconnectRuntimeShortBreakAnchor,
  ensureReconnectRuntimeState,
  markReconnectRuntimeLongRestStarted,
  planReconnectRuntime,
  RECONNECT_RUNTIME_REASONS,
  type ReconnectRuntimeReason,
} from '../reconnect-runtime-state'
import { getRunnerByScope } from '../runner-tabs'
import { getPlayerSessionManagementConfig } from '../session-management'
import { ensureWorldPlayersLoaded, getWorldPlayerByScopeKey } from '../world-players'
import {
  EXECUTION_CONTROLLER_EVENTS,
  EXECUTION_KINDS,
  EXECUTION_RULES,
  EXECUTION_STATUSES,
  type ControllerExecutionRef,
  type ExecutionKind,
  type ExecutionStatus,
} from './contract'
import {
  clearControllerScopeAlarm,
  parseControllerScopeAlarmName,
  scheduleControllerScopeAlarm,
} from './alarm'
import { onControllerExecutionEvent } from './runtime'
import {
  getAllControllerExecutionDocuments,
  getControllerExecutionDocumentsByScope,
} from './storage'

type RunnerReportStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed'
type RunnerControllerStatus = 'idle' | 'running' | 'pausing' | 'paused'

type ControllerRunInstruction = {
  machine: string | null
  module: string | null
  data: Record<string, unknown> | null
  reason: string
  source: string
  executionId: string | null
  kind: ExecutionKind | null
  dueAt: number | null
  dispatchId: string
}

type ScopeRuntimeState = {
  scopeKey: string
  status: RunnerControllerStatus
  current: ControllerRunInstruction | null
  pending: ControllerRunInstruction | null
  pauseRequested: boolean
  botProtectActive: boolean
  botProtectDetectedAt: number | null
  botProtectClearedAt: number | null
  transitionChain: Promise<void>
  lastKnownScreen: string | null
  lastKnownBotProtect: boolean
  lastKnownTabId: number | null
  lastKnownWindowId: number | null
  alarmScheduledAt: number | null
  lastDispatchAt: number | null
}

type DispatchScopeOptions = {
  reason?: string
  source?: string
  allowFallback?: boolean
  executeNow?: boolean
  stopIfNoInstruction?: boolean
  clearBotProtect?: boolean
  screen?: string | null
  isBotProtected?: boolean
}

type ReconcileScopeTrackedInstructionsOptions = {
  trackedMachines?: string[]
  allowedPendingMachines?: string[]
  allowedPendingExecutionIds?: string[]
  stopCurrentMachines?: string[]
  reason?: string
  source?: string
}

type ResolveGameStageInstructionArgs = {
  scopeKey?: string | null
  shouldStart?: boolean
  screen?: string | null
  isBotProtected?: boolean
  senderTabId?: number | null
  senderWindowId?: number | null
}

type ScopeWakeupState = {
  dueNow: boolean
  wakeupAt: number | null
}

type ExecutionWakeupEntry = {
  execution: ControllerExecutionRef
  wakeupAt: number
}

type ScopeWorldPlayerRef = {
  playerId: number | null
  world: string | null
}

type SmartSessionReconnectDecision = {
  activate: {
    reason: ReconnectRuntimeReason
    reconnectAt: number
  } | null
  nextWakeupAt: number | null
}

const RUNNER_REPORT_STATUS_BY_EVENT: Record<string, RunnerReportStatus> = {
  [EXECUTION_CONTROLLER_EVENTS.EXECUTION_STARTED]: 'running',
  [EXECUTION_CONTROLLER_EVENTS.EXECUTION_PAUSED]: 'paused',
  [EXECUTION_CONTROLLER_EVENTS.EXECUTION_STOPPED]: 'stopped',
  [EXECUTION_CONTROLLER_EVENTS.EXECUTION_COMPLETED]: 'completed',
  [EXECUTION_CONTROLLER_EVENTS.EXECUTION_FAILED]: 'failed',
}

const ACTIVE_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  EXECUTION_STATUSES.IDLE,
  EXECUTION_STATUSES.QUEUED,
  EXECUTION_STATUSES.RUNNING,
  EXECUTION_STATUSES.PAUSED,
])

const IMMEDIATE_DECISION_TYPES = new Set([
  'dispatch-now',
  'continue-mint-short-delay',
  'page-short-wakeup',
])
const SMART_SESSION_MIN_BUFFER_MS = 60_000
const SMART_SESSION_LONG_REST_MIN_DURATION_DELAY_MINUTES = 1
const SMART_SESSION_LONG_REST_MIN_START_DELAY_MINUTES = 5
const SMART_SESSION_PRIORITY_KINDS = new Set<ExecutionKind>([
  EXECUTION_KINDS.COMMAND,
  EXECUTION_KINDS.MINT,
])

const scopeRuntimeStateByScope = new Map<string, ScopeRuntimeState>()
const runnerControllerDisposers: Array<() => void> = []
let runnerControllerInitialized = false

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeInstructionData(value: unknown) {
  return asRecord(value)
}

function createDispatchId(scopeKey: string) {
  return `${scopeKey}:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function logRunnerController(
  label: string,
  detail: Record<string, unknown>,
) {
  console.log(`[SW][RUNNER_CONTROLLER][${label}]`, detail)
}

function summarizeExecutionWakeups(
  entries: ExecutionWakeupEntry[] = [],
) {
  return entries.map((entry) => ({
    executionId: entry.execution.executionId,
    kind: entry.execution.kind,
    status: entry.execution.status,
    wakeupAt: entry.wakeupAt,
  }))
}

function mergeWakeupAt(
  currentWakeupAt: number | null,
  candidateWakeupAt: number | null,
) {
  if (!Number.isFinite(candidateWakeupAt)) {
    return currentWakeupAt
  }

  if (!Number.isFinite(currentWakeupAt)) {
    return Number(candidateWakeupAt)
  }

  return Math.min(Number(currentWakeupAt), Number(candidateWakeupAt))
}

function getWakeupAtAfterExecution(
  executionWakeupAt: number,
) {
  return executionWakeupAt + SMART_SESSION_MIN_BUFFER_MS
}

function isMdfScopeKey(scopeKey?: string | null) {
  if (!scopeKey) {
    return false
  }

  const [, tValue] = scopeKey.split(':')

  return typeof tValue === 'string' && tValue.length > 0 && tValue !== 'main'
}

function hashString(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

function resolveDeterministicInteger({
  seed,
  min,
  max,
}: {
  seed: string
  min: number
  max: number
}) {
  if (max <= min) {
    return min
  }

  return min + (hashString(seed) % ((max - min) + 1))
}

function getOrCreateScopeRuntimeState(scopeKey: string) {
  const existing = scopeRuntimeStateByScope.get(scopeKey)

  if (existing) {
    return existing
  }

  const next: ScopeRuntimeState = {
    scopeKey,
    status: 'idle',
    current: null,
    pending: null,
    pauseRequested: false,
    botProtectActive: false,
    botProtectDetectedAt: null,
    botProtectClearedAt: null,
    transitionChain: Promise.resolve(),
    lastKnownScreen: null,
    lastKnownBotProtect: false,
    lastKnownTabId: null,
    lastKnownWindowId: null,
    alarmScheduledAt: null,
    lastDispatchAt: null,
  }

  scopeRuntimeStateByScope.set(scopeKey, next)

  return next
}

async function runScopeTransition<T>(
  scopeKey: string,
  task: (scopeState: ScopeRuntimeState) => Promise<T>,
) {
  const scopeState = getOrCreateScopeRuntimeState(scopeKey)
  const previous = scopeState.transitionChain
  let nextTransition: Promise<void> = Promise.resolve()

  const next = previous
    .catch(() => {})
    .then(async () => await task(scopeState))

  nextTransition = next
    .then(() => {})
    .catch(() => {})

  scopeState.transitionChain = nextTransition

  return await next
}

function updateScopeRuntimeContext(
  scopeState: ScopeRuntimeState,
  {
    screen,
    isBotProtected,
    senderTabId,
    senderWindowId,
  }: {
    screen?: string | null
    isBotProtected?: boolean
    senderTabId?: number | null
    senderWindowId?: number | null
  } = {},
) {
  const normalizedScreen = normalizeString(screen)
  const normalizedTabId = normalizeNumber(senderTabId)
  const normalizedWindowId = normalizeNumber(senderWindowId)

  if (normalizedScreen) {
    scopeState.lastKnownScreen = normalizedScreen
  }

  if (typeof isBotProtected === 'boolean') {
    scopeState.lastKnownBotProtect = isBotProtected
  }

  if (normalizedTabId !== null) {
    scopeState.lastKnownTabId = normalizedTabId
  }

  if (normalizedWindowId !== null) {
    scopeState.lastKnownWindowId = normalizedWindowId
  }
}

async function postRunnerControllerCommand(
  scopeState: ScopeRuntimeState,
  payload: {
    action: 'run' | 'pause' | 'stop'
    reason?: string
    source?: string
    dispatchId?: string
    machine?: string | null
    module?: string | null
    data?: Record<string, unknown> | null
    executionId?: string | null
    executionKind?: ExecutionKind | null
    dueAt?: number | null
  },
) {
  const runner = getRunnerByScope(scopeState.scopeKey)

  if (!runner) {
    logRunnerController('NO_RUNNER', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      payload,
      lastKnownTabId: scopeState.lastKnownTabId,
      lastKnownWindowId: scopeState.lastKnownWindowId,
    })
    return false
  }

  try {
    logRunnerController('SEND', {
      scopeKey: scopeState.scopeKey,
      tabId: runner.tabId,
      windowId: runner.windowId,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      payload,
    })

    await chrome.tabs.sendMessage(runner.tabId, {
      extensionId: RELEASE_EXTENSION_ID,
      type: RUNNER_CONTROLLER_MESSAGE_TYPE,
      scopeKey: scopeState.scopeKey,
      ...payload,
    })

    scopeState.lastKnownTabId = runner.tabId
    scopeState.lastKnownWindowId = runner.windowId

    logRunnerController('SENT', {
      scopeKey: scopeState.scopeKey,
      tabId: runner.tabId,
      windowId: runner.windowId,
      status: scopeState.status,
      payload,
    })

    return true
  } catch (error) {
    console.warn('[SW][RUNNER_CONTROLLER] tabs.sendMessage failed', {
      scopeKey: scopeState.scopeKey,
      tabId: runner.tabId,
      windowId: runner.windowId,
      action: payload.action,
      error,
    })

    return false
  }
}

function getExecutionWakeupAt(execution: ControllerExecutionRef) {
  if (execution.kind === EXECUTION_KINDS.BOT_PROTECT) {
    return Date.now()
  }

  if (execution.kind === EXECUTION_KINDS.COMMAND) {
    return normalizeNumber(execution.command?.alarmAt)
  }

  return normalizeNumber(execution.nextAt)
}

function isExecutionDispatchable(execution: ControllerExecutionRef | null) {
  if (!execution) {
    return false
  }

  return ACTIVE_EXECUTION_STATUSES.has(execution.status)
}

function compareExecutionPriority(
  left: ExecutionWakeupEntry,
  right: ExecutionWakeupEntry,
) {
  const leftPriority = EXECUTION_RULES[left.execution.kind]?.priority ?? 0
  const rightPriority = EXECUTION_RULES[right.execution.kind]?.priority ?? 0

  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority
  }

  if (left.wakeupAt !== right.wakeupAt) {
    return left.wakeupAt - right.wakeupAt
  }

  return left.execution.updatedAt - right.execution.updatedAt
}

function compareExecutionWakeupAscending(
  left: ExecutionWakeupEntry,
  right: ExecutionWakeupEntry,
) {
  if (left.wakeupAt !== right.wakeupAt) {
    return left.wakeupAt - right.wakeupAt
  }

  return compareExecutionPriority(left, right)
}

function createExecutionWakeupEntries(
  documents: Awaited<ReturnType<typeof getControllerExecutionDocumentsByScope>>,
) {
  return documents
    .map((document) => document.execution)
    .filter((execution): execution is ControllerExecutionRef => (
      isExecutionDispatchable(execution)
    ))
    .map((execution) => {
      const wakeupAt = getExecutionWakeupAt(execution)

      return wakeupAt === null
        ? null
        : {
          execution,
          wakeupAt,
        }
    })
    .filter((entry): entry is ExecutionWakeupEntry => entry !== null)
}

async function getDispatchableExecutionWakeupsByScope(scopeKey: string) {
  const documents = await getControllerExecutionDocumentsByScope(scopeKey)

  return createExecutionWakeupEntries(documents)
}

async function resolveScopeWorldPlayer(
  scopeKey: string,
): Promise<ScopeWorldPlayerRef> {
  await ensureWorldPlayersLoaded()

  const worldPlayer = getWorldPlayerByScopeKey(scopeKey)

  if (worldPlayer) {
    logRunnerController('SMART_SESSION_SCOPE_WORLD_PLAYER', {
      source: 'world-player-cache',
      scopeKey,
      resolvedWorld: worldPlayer.world,
      resolvedPlayerId: worldPlayer.playerId,
      worldPlayerScopeKey: worldPlayer.scopeKey,
      worldPlayerUpdatedAt: worldPlayer.updatedAt,
    })

    return {
      playerId: worldPlayer.playerId,
      world: worldPlayer.world,
    }
  }

  await ensurePreparedContextLoaded()

  const tabContext = getTabContextsByScopeKey(scopeKey)[0] || null

  logRunnerController('SMART_SESSION_SCOPE_WORLD_PLAYER', {
    source: 'prepared-context',
    scopeKey,
    resolvedWorld: normalizeString(tabContext?.world),
    resolvedPlayerId: normalizeNumber(tabContext?.playerId),
    tabContextCount: getTabContextsByScopeKey(scopeKey).length,
    tabContextTabId: normalizeNumber(tabContext?.tabId),
    tabContextWindowId: normalizeNumber(tabContext?.windowId),
    tabContextUpdatedAt: normalizeString(tabContext?.updatedAt),
    tabContextContext: normalizeString(tabContext?.context),
    tabContextPlayerName: normalizeString(tabContext?.playerName),
  })

  return {
    playerId: normalizeNumber(tabContext?.playerId),
    world: normalizeString(tabContext?.world),
  }
}

function getLongRestDurationMs(
  scopeKey: string,
  reconnectAtSeed: number,
  maxDurationDelayMinutes: number,
  durationMinutes: number,
) {
  const extraMinutes = resolveDeterministicInteger({
    seed: `${scopeKey}:long-rest-duration:${reconnectAtSeed}`,
    min: SMART_SESSION_LONG_REST_MIN_DURATION_DELAY_MINUTES,
    max: maxDurationDelayMinutes,
  })

  return (durationMinutes + extraMinutes) * 60_000
}

function getLongRestStartDelayMs(
  scopeKey: string,
  candidateBaseAt: number,
  maxStartDelayMinutes: number,
) {
  const delayMinutes = resolveDeterministicInteger({
    seed: `${scopeKey}:long-rest-start:${candidateBaseAt}`,
    min: SMART_SESSION_LONG_REST_MIN_START_DELAY_MINUTES,
    max: maxStartDelayMinutes,
  })

  return delayMinutes * 60_000
}

function getScheduledOccurrenceBaseAt(
  reference: Date,
  time: string,
  dayOffset: number,
) {
  const [hoursPart, minutesPart] = time.split(':')
  const hours = Number(hoursPart)
  const minutes = Number(minutesPart)
  const occurrence = new Date(reference)

  occurrence.setHours(0, 0, 0, 0)
  occurrence.setDate(occurrence.getDate() + dayOffset)
  occurrence.setHours(hours, minutes, 0, 0)

  return occurrence.getTime()
}

function resolveScheduledLongRestCandidateAt(
  scopeKey: string,
  scheduledTimes: string[],
  startDelayMinutes: number,
) {
  const now = Date.now()
  const reference = new Date(now)
  const candidates = Array.from(
    new Set(
      [-1, 0, 1, 2].flatMap((dayOffset) => (
        scheduledTimes.map((time) => {
          const baseAt = getScheduledOccurrenceBaseAt(reference, time, dayOffset)

          return baseAt + getLongRestStartDelayMs(scopeKey, baseAt, startDelayMinutes)
        })
      )),
    ),
  ).sort((left, right) => left - right)

  const recentDueCandidate = [...candidates]
    .reverse()
    .find((candidateAt) => candidateAt <= now && (now - candidateAt) <= SMART_SESSION_MIN_BUFFER_MS)

  if (typeof recentDueCandidate === 'number') {
    return recentDueCandidate
  }

  return candidates.find((candidateAt) => candidateAt > now) ?? null
}

async function resolveLongRestCandidateAt(
  scopeKey: string,
  {
    playerId,
    world,
  }: ScopeWorldPlayerRef,
  reconnectRuntimeState: Awaited<ReturnType<typeof ensureReconnectRuntimeState>>,
  {
    intervalHours,
    mode,
    scheduledTimes,
    startDelayMinutes,
  }: {
    intervalHours: number
    mode: 'interval' | 'schedule'
    scheduledTimes: string[]
    startDelayMinutes: number
  },
) {
  if (mode === 'schedule') {
    return resolveScheduledLongRestCandidateAt(
      scopeKey,
      scheduledTimes,
      startDelayMinutes,
    )
  }

  const anchorAt = reconnectRuntimeState?.longRestAnchorAt ?? await ensureReconnectRuntimeLongRestAnchor({
    scopeKey,
    world,
    playerId,
  })

  if (anchorAt === null) {
    return null
  }

  const baseAt = (reconnectRuntimeState?.lastLongRestStartedAt ?? anchorAt) + (intervalHours * 60 * 60 * 1000)

  return baseAt + getLongRestStartDelayMs(scopeKey, baseAt, startDelayMinutes)
}

async function resolveShortBreakCandidateAt(
  scopeKey: string,
  {
    playerId,
    world,
  }: ScopeWorldPlayerRef,
  reconnectRuntimeState: Awaited<ReturnType<typeof ensureReconnectRuntimeState>>,
  delayMinutes: number,
) {
  const anchorAt = reconnectRuntimeState?.shortBreakAnchorAt ?? await ensureReconnectRuntimeShortBreakAnchor({
    scopeKey,
    world,
    playerId,
  })

  if (anchorAt === null) {
    return null
  }

  return anchorAt + (delayMinutes * 60_000)
}

async function resolveSmartSessionDecision(
  scopeState: ScopeRuntimeState,
): Promise<SmartSessionReconnectDecision> {
  if (isMdfScopeKey(scopeState.scopeKey)) {
    logRunnerController('SMART_SESSION_SKIP', {
      scopeKey: scopeState.scopeKey,
      reason: 'mdf-scope',
    })

    return {
      activate: null,
      nextWakeupAt: null,
    }
  }

  const scopeWorldPlayer = await resolveScopeWorldPlayer(scopeState.scopeKey)

  if (!scopeWorldPlayer.world || scopeWorldPlayer.playerId === null) {
    logRunnerController('SMART_SESSION_SKIP', {
      scopeKey: scopeState.scopeKey,
      reason: 'missing-scope-world-player',
      resolvedWorld: scopeWorldPlayer.world,
      resolvedPlayerId: scopeWorldPlayer.playerId,
    })

    return {
      activate: null,
      nextWakeupAt: null,
    }
  }

  const [sessionManagement, reconnectRuntimeState, executionWakeups] = await Promise.all([
    getPlayerSessionManagementConfig(scopeWorldPlayer.world, scopeWorldPlayer.playerId),
    ensureReconnectRuntimeState({
      scopeKey: scopeState.scopeKey,
      world: scopeWorldPlayer.world,
      playerId: scopeWorldPlayer.playerId,
    }),
    getDispatchableExecutionWakeupsByScope(scopeState.scopeKey),
  ])

  if (!sessionManagement || !reconnectRuntimeState || reconnectRuntimeState.activeReason !== null) {
    logRunnerController('SMART_SESSION_SKIP', {
      scopeKey: scopeState.scopeKey,
      reason: !sessionManagement
        ? 'missing-session-management'
        : !reconnectRuntimeState
          ? 'missing-reconnect-runtime-state'
          : 'reconnect-already-active',
      resolvedWorld: scopeWorldPlayer.world,
      resolvedPlayerId: scopeWorldPlayer.playerId,
      reconnectActiveReason: reconnectRuntimeState?.activeReason ?? null,
    })

    return {
      activate: null,
      nextWakeupAt: null,
    }
  }

  const now = Date.now()
  const hasExecutionWithinOneMinute = executionWakeups.some((entry) => (
    entry.wakeupAt > now
    && (entry.wakeupAt - now) <= SMART_SESSION_MIN_BUFFER_MS
  ))

  const nextBlockingExecution = executionWakeups
    .filter((entry) => SMART_SESSION_PRIORITY_KINDS.has(entry.execution.kind) && entry.wakeupAt > now)
    .sort(compareExecutionWakeupAscending)[0] ?? null
  let nextWakeupAt: number | null = null

  logRunnerController('SMART_SESSION_EVALUATE', {
    scopeKey: scopeState.scopeKey,
    resolvedWorld: scopeWorldPlayer.world,
    resolvedPlayerId: scopeWorldPlayer.playerId,
    reconnectActiveReason: reconnectRuntimeState.activeReason,
    shortBreak: {
      enabled: sessionManagement.smartSession.shortBreak.enabled,
      minIdleMinutes: sessionManagement.smartSession.shortBreak.minIdleMinutes,
      delayMinutes: sessionManagement.smartSession.shortBreak.delayMinutes,
    },
    longRest: {
      enabled: sessionManagement.smartSession.longRest.enabled,
      mode: sessionManagement.smartSession.longRest.mode,
      intervalHours: sessionManagement.smartSession.longRest.intervalHours,
      durationMinutes: sessionManagement.smartSession.longRest.durationMinutes,
      durationDelayMinutes: sessionManagement.smartSession.longRest.durationDelayMinutes,
      startDelayMinutes: sessionManagement.smartSession.longRest.startDelayMinutes,
      scheduledTimes: sessionManagement.smartSession.longRest.scheduledTimes,
    },
    hasExecutionWithinOneMinute,
    wakeups: summarizeExecutionWakeups(executionWakeups),
    nextBlockingExecution: nextBlockingExecution
      ? {
        executionId: nextBlockingExecution.execution.executionId,
        kind: nextBlockingExecution.execution.kind,
        status: nextBlockingExecution.execution.status,
        wakeupAt: nextBlockingExecution.wakeupAt,
      }
      : null,
  })

  if (sessionManagement.smartSession.longRest.enabled === true) {
    const candidateAt = await resolveLongRestCandidateAt(
      scopeState.scopeKey,
      scopeWorldPlayer,
      reconnectRuntimeState,
      sessionManagement.smartSession.longRest,
    )

    if (typeof candidateAt === 'number') {
      if (candidateAt <= now) {
        const longRestDurationMs = getLongRestDurationMs(
          scopeState.scopeKey,
          candidateAt,
          sessionManagement.smartSession.longRest.durationDelayMinutes,
          sessionManagement.smartSession.longRest.durationMinutes,
        )
        const conflictingExecution = nextBlockingExecution
          && nextBlockingExecution.wakeupAt <= (now + longRestDurationMs + SMART_SESSION_MIN_BUFFER_MS)
          ? nextBlockingExecution
          : null

        if (!conflictingExecution) {
          logRunnerController('SMART_SESSION_ACTIVATE', {
            scopeKey: scopeState.scopeKey,
            reason: 'long-rest',
            candidateAt,
            reconnectAt: now + longRestDurationMs,
            longRestDurationMs,
            nextBlockingExecutionWakeupAt: nextBlockingExecution?.wakeupAt ?? null,
          })

          return {
            activate: {
              reason: RECONNECT_RUNTIME_REASONS.LONG_REST,
              reconnectAt: now + longRestDurationMs,
            },
            nextWakeupAt: null,
          }
        }

        nextWakeupAt = mergeWakeupAt(
          nextWakeupAt,
          getWakeupAtAfterExecution(conflictingExecution.wakeupAt),
        )

        logRunnerController('SMART_SESSION_PENDING', {
          scopeKey: scopeState.scopeKey,
          reason: 'long-rest-blocked-by-execution',
          candidateAt,
          nextWakeupAt,
          longRestDurationMs,
          nextBlockingExecutionWakeupAt: conflictingExecution.wakeupAt,
        })

        return {
          activate: null,
          nextWakeupAt,
        }
      }

      if (candidateAt > now) {
        nextWakeupAt = mergeWakeupAt(nextWakeupAt, candidateAt)

        logRunnerController('SMART_SESSION_PENDING', {
          scopeKey: scopeState.scopeKey,
          reason: 'long-rest-candidate-future',
          candidateAt,
          nextWakeupAt,
        })
      }
    }
  }

  if (sessionManagement.smartSession.shortBreak.enabled === true) {
    const candidateAt = await resolveShortBreakCandidateAt(
      scopeState.scopeKey,
      scopeWorldPlayer,
      reconnectRuntimeState,
      sessionManagement.smartSession.shortBreak.delayMinutes,
    )
    const minIdleMs = sessionManagement.smartSession.shortBreak.minIdleMinutes * 60_000

    if (typeof candidateAt === 'number') {
      if (candidateAt > now) {
        nextWakeupAt = mergeWakeupAt(nextWakeupAt, candidateAt)

        logRunnerController('SMART_SESSION_PENDING', {
          scopeKey: scopeState.scopeKey,
          reason: 'short-break-candidate-future',
          candidateAt,
          nextWakeupAt,
        })

      } else {
        const conflictingExecution = nextBlockingExecution
          && nextBlockingExecution.wakeupAt <= (now + minIdleMs + SMART_SESSION_MIN_BUFFER_MS)
          ? nextBlockingExecution
          : null

        if (!conflictingExecution) {
          const reconnectAt = now + minIdleMs

          logRunnerController('SMART_SESSION_ACTIVATE', {
            scopeKey: scopeState.scopeKey,
            reason: 'short-break',
            candidateAt,
            reconnectAt,
            nextWakeupAt,
            minIdleMs,
            nextBlockingExecutionWakeupAt: nextBlockingExecution?.wakeupAt ?? null,
          })

          return {
            activate: {
              reason: RECONNECT_RUNTIME_REASONS.SHORT_BREAK,
              reconnectAt,
            },
            nextWakeupAt,
          }
        }

        nextWakeupAt = mergeWakeupAt(
          nextWakeupAt,
          getWakeupAtAfterExecution(conflictingExecution.wakeupAt),
        )

        logRunnerController('SMART_SESSION_PENDING', {
          scopeKey: scopeState.scopeKey,
          reason: 'short-break-blocked-by-execution',
          candidateAt,
          nextWakeupAt,
          minIdleMs,
          nextBlockingExecutionWakeupAt: conflictingExecution.wakeupAt,
        })
      }
    }
  }

  logRunnerController('SMART_SESSION_SKIP', {
    scopeKey: scopeState.scopeKey,
    reason: 'no-smart-session-action',
    nextWakeupAt,
    hasNextBlockingExecution: Boolean(nextBlockingExecution),
  })

  return {
    activate: null,
    nextWakeupAt,
  }
}

async function navigateScopeToReconnectLogin(
  scopeState: ScopeRuntimeState,
) {
  const runner = getRunnerByScope(scopeState.scopeKey)

  if (!runner) {
    return false
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: {
        tabId: runner.tabId,
      },
      func: () => {
        const gameData = (window as Window & {
          game_data?: {
            csrf?: unknown
            link_base_pure?: unknown
          }
        }).game_data
        const linkBasePure = typeof gameData?.link_base_pure === 'string'
          ? gameData.link_base_pure.trim()
          : ''
        const csrf = typeof gameData?.csrf === 'string'
          ? gameData.csrf.trim()
          : ''

        if (!linkBasePure || !csrf) {
          return {
            ok: false,
            reason: 'missing-game-data-logout-parts',
          }
        }

        const url = new URL(
          `${linkBasePure}&action=logout&h=${csrf}`,
          window.location.origin,
        )

        window.location.assign(url)

        return {
          href: url.href,
          ok: true,
        }
      },
    })

    return results.some((result) => result.result?.ok === true)
  } catch (error) {
    console.warn('[SW][RUNNER_CONTROLLER] smart reconnect navigation failed', {
      scopeKey: scopeState.scopeKey,
      tabId: runner.tabId,
      windowId: runner.windowId,
      error,
    })

    return false
  }
}

async function activateSmartSessionReconnect(
  scopeState: ScopeRuntimeState,
  decision: NonNullable<SmartSessionReconnectDecision['activate']>,
) {
  const scopeWorldPlayer = await resolveScopeWorldPlayer(scopeState.scopeKey)

  if (!scopeWorldPlayer.world || scopeWorldPlayer.playerId === null) {
    return false
  }

  await planReconnectRuntime({
    scopeKey: scopeState.scopeKey,
    world: scopeWorldPlayer.world,
    playerId: scopeWorldPlayer.playerId,
    reason: decision.reason,
    reconnectAt: decision.reconnectAt,
    plannedAt: Date.now(),
  })

  const stopped = await requestStopCurrentInstruction(scopeState, {
    reason: `smart-session:${decision.reason}`,
    source: 'smart-session',
    clearPending: false,
  })

  if (!stopped) {
    await clearReconnectRuntimeActive(scopeState.scopeKey)
    return false
  }

  const navigated = await navigateScopeToReconnectLogin(scopeState)

  if (!navigated) {
    await clearReconnectRuntimeActive(scopeState.scopeKey)
    return false
  }

  if (decision.reason === RECONNECT_RUNTIME_REASONS.LONG_REST) {
    await markReconnectRuntimeLongRestStarted(scopeState.scopeKey)
  }

  return true
}

async function clearReconnectRuntimeIfReturned(
  scopeKey: string,
) {
  return Boolean(
    await clearReconnectRuntimeActiveOnGameReturn(scopeKey),
  )
}

function createInstructionFromExecution(
  scopeState: ScopeRuntimeState,
  execution: ControllerExecutionRef,
  {
    source = 'controller-dispatch',
    reason = `execution-due:${execution.kind}`,
  }: {
    source?: string
    reason?: string
  } = {},
): ControllerRunInstruction {
  const payload = asRecord(execution.payload) || {}
  const payloadMachine = normalizeString(payload.machine)
  const payloadModule = normalizeString(payload.module)
  const payloadData = normalizeInstructionData(payload.data)
  const data = payloadData || (Object.keys(payload).length ? payload : null)
  const fallbackMachine = execution.kind === EXECUTION_KINDS.BOT_PROTECT
    ? 'solver'
    : 'game'
  const machine = payloadMachine ?? fallbackMachine
  const module = machine === 'solver'
    ? null
    : payloadModule ?? scopeState.lastKnownScreen

  return {
    machine,
    module,
    data,
    reason,
    source,
    executionId: normalizeString(execution.executionId),
    kind: execution.kind,
    dueAt: getExecutionWakeupAt(execution),
    dispatchId: createDispatchId(scopeState.scopeKey),
  }
}

function createFallbackInstruction(
  scopeState: ScopeRuntimeState,
  {
    screen,
    isBotProtected = false,
    source = 'game-stage',
    reason = isBotProtected ? 'bot-protect-active' : 'stage-fallback',
  }: {
    screen?: string | null
    isBotProtected?: boolean
    source?: string
    reason?: string
  } = {},
): ControllerRunInstruction {
  const module = normalizeString(screen) ?? scopeState.lastKnownScreen
  const machine = isBotProtected ? 'solver' : null

  return {
    machine,
    module: machine === 'solver' ? null : module,
    data: null,
    reason,
    source,
    executionId: null,
    kind: isBotProtected ? EXECUTION_KINDS.BOT_PROTECT : null,
    dueAt: isBotProtected ? Date.now() : null,
    dispatchId: createDispatchId(scopeState.scopeKey),
  }
}

function isBotProtectInstruction(instruction: ControllerRunInstruction | null) {
  if (!instruction) {
    return false
  }

  return instruction.kind === EXECUTION_KINDS.BOT_PROTECT
    || instruction.machine === 'solver'
}

function shouldDeferIncomingApplyPreemption(
  instruction: ControllerRunInstruction | null,
) {
  if (!instruction) {
    return false
  }

  return instruction.kind === EXECUTION_KINDS.COMMAND
    || instruction.kind === EXECUTION_KINDS.MINT
    || isBotProtectInstruction(instruction)
}

function applyBotProtectObservation(
  scopeState: ScopeRuntimeState,
  {
    isBotProtected,
    clearBotProtect = false,
  }: {
    isBotProtected?: boolean
    clearBotProtect?: boolean
  } = {},
) {
  if (isBotProtected === true) {
    scopeState.botProtectActive = true
    scopeState.botProtectDetectedAt = Date.now()
    scopeState.botProtectClearedAt = null
    return
  }

  if (clearBotProtect) {
    scopeState.botProtectActive = false
    scopeState.botProtectClearedAt = Date.now()
  }
}

async function clearBotProtectInstructions(
  scopeState: ScopeRuntimeState,
  {
    reason = 'bot-protect-cleared',
    source = 'controller-dispatch',
  }: {
    reason?: string
    source?: string
  } = {},
) {
  if (isBotProtectInstruction(scopeState.current)) {
    await postRunnerControllerCommand(scopeState, {
      action: 'stop',
      reason,
      source,
      dispatchId: createDispatchId(scopeState.scopeKey),
    })
  }

  if (isBotProtectInstruction(scopeState.current)) {
    scopeState.current = null
  }

  if (isBotProtectInstruction(scopeState.pending)) {
    scopeState.pending = null
  }

  if (!scopeState.current) {
    scopeState.status = 'idle'
    scopeState.pauseRequested = false
  }
}

function isSameRunInstruction(
  left: ControllerRunInstruction | null,
  right: ControllerRunInstruction | null,
) {
  if (!left || !right) {
    return false
  }

  if (left.executionId && right.executionId) {
    return left.executionId === right.executionId
      && left.machine === right.machine
      && left.module === right.module
  }

  return left.machine === right.machine
    && left.module === right.module
    && left.kind === right.kind
}

async function dispatchRunInstruction(
  scopeState: ScopeRuntimeState,
  instruction: ControllerRunInstruction,
) {
  logRunnerController('DISPATCH_REQUEST', {
    scopeKey: scopeState.scopeKey,
    status: scopeState.status,
    current: scopeState.current,
    pending: scopeState.pending,
    instruction,
  })

  const sent = await postRunnerControllerCommand(scopeState, {
    action: 'run',
    source: instruction.source,
    reason: instruction.reason,
    dispatchId: instruction.dispatchId,
    machine: instruction.machine,
    module: instruction.module,
    data: instruction.data,
    executionId: instruction.executionId,
    executionKind: instruction.kind,
    dueAt: instruction.dueAt,
  })

  if (!sent) {
    scopeState.pending = instruction
    logRunnerController('DISPATCH_DEFERRED', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      instruction,
    })
    return false
  }

  scopeState.current = instruction
  scopeState.pending = null
  scopeState.pauseRequested = false
  scopeState.status = 'running'
  scopeState.lastDispatchAt = Date.now()

  logRunnerController('DISPATCH_RUNNING', {
    scopeKey: scopeState.scopeKey,
    status: scopeState.status,
    current: scopeState.current,
    pending: scopeState.pending,
    instruction,
  })

  return true
}

async function requestPauseCurrentInstruction(
  scopeState: ScopeRuntimeState,
  {
    reason = 'controller-preempt',
    source = 'controller-dispatch',
  }: {
    reason?: string
    source?: string
  } = {},
) {
  if (!scopeState.current || scopeState.pauseRequested) {
    return true
  }

  const sent = await postRunnerControllerCommand(scopeState, {
    action: 'pause',
    reason,
    source,
    dispatchId: createDispatchId(scopeState.scopeKey),
  })

  if (!sent) {
    return false
  }

  scopeState.pauseRequested = true
  scopeState.status = 'pausing'

  return true
}

async function requestStopCurrentInstruction(
  scopeState: ScopeRuntimeState,
  {
    reason = 'controller-stop',
    source = 'controller-dispatch',
    clearPending = true,
  }: {
    reason?: string
    source?: string
    clearPending?: boolean
  } = {},
) {
  if (!scopeState.current) {
    return true
  }

  const sent = await postRunnerControllerCommand(scopeState, {
    action: 'stop',
    reason,
    source,
    dispatchId: createDispatchId(scopeState.scopeKey),
  })

  if (!sent) {
    return false
  }

  scopeState.status = 'idle'
  scopeState.current = null
  if (clearPending) {
    scopeState.pending = null
  }
  scopeState.pauseRequested = false

  return true
}

function normalizeMachineSet(values: string[] = []) {
  return new Set(
    values
      .map((value) => normalizeString(value))
      .filter((value): value is string => value !== null),
  )
}

function normalizeExecutionIdSet(values: Array<string | null | undefined> = []) {
  return new Set(
    values
      .map((value) => normalizeString(value))
      .filter((value): value is string => value !== null),
  )
}

function getInstructionMachine(instruction: ControllerRunInstruction | null) {
  return normalizeString(instruction?.machine)
}

function getInstructionExecutionId(instruction: ControllerRunInstruction | null) {
  return normalizeString(instruction?.executionId)
}

function isTrackedInstructionMachine(
  instruction: ControllerRunInstruction | null,
  trackedMachines: Set<string>,
) {
  const machine = getInstructionMachine(instruction)

  return machine !== null && trackedMachines.has(machine)
}

async function runPendingInstructionIfPossible(
  scopeState: ScopeRuntimeState,
) {
  if (!scopeState.pending) {
    return false
  }

  if (scopeState.status === 'running' || scopeState.status === 'pausing') {
    return false
  }

  const nextInstruction = scopeState.pending
  scopeState.pending = null

  return await dispatchRunInstruction(scopeState, nextInstruction)
}

async function resolveDueExecutionInstruction(
  scopeState: ScopeRuntimeState,
  {
    source = 'controller-dispatch',
    reason = null,
  }: {
    source?: string
    reason?: string | null
  } = {},
) {
  const now = Date.now()
  const dueCandidates = (await getDispatchableExecutionWakeupsByScope(scopeState.scopeKey))
    .filter((entry) => entry.wakeupAt <= now)
    .sort(compareExecutionPriority)

  const selected = dueCandidates[0]

  if (!selected) {
    return null
  }

  return createInstructionFromExecution(scopeState, selected.execution, {
    source,
    reason: reason ?? `execution-due:${selected.execution.kind}`,
  })
}

async function resolveScopeWakeupState(scopeState: ScopeRuntimeState): Promise<ScopeWakeupState> {
  const now = Date.now()
  const [executionWakeups, smartSessionDecision] = await Promise.all([
    getDispatchableExecutionWakeupsByScope(scopeState.scopeKey),
    resolveSmartSessionDecision(scopeState),
  ])
  const wakeups = executionWakeups.map((entry) => entry.wakeupAt)
  const smartWakeupAt = smartSessionDecision.activate
    ? now
    : smartSessionDecision.nextWakeupAt

  if (typeof smartWakeupAt === 'number') {
    wakeups.push(smartWakeupAt)
  }

  if (!wakeups.length) {
    return {
      dueNow: false,
      wakeupAt: null,
    }
  }

  const dueNow = wakeups.some((wakeupAt) => wakeupAt <= now)

  if (dueNow) {
    return {
      dueNow: true,
      wakeupAt: null,
    }
  }

  const wakeupAt = Math.min(...wakeups)

  return {
    dueNow: false,
    wakeupAt,
  }
}

async function syncControllerScopeAlarmInternal(scopeState: ScopeRuntimeState) {
  const wakeupState = await resolveScopeWakeupState(scopeState)

  if (wakeupState.dueNow || wakeupState.wakeupAt === null) {
    await clearControllerScopeAlarm(scopeState.scopeKey)
    scopeState.alarmScheduledAt = null
    return wakeupState
  }

  await scheduleControllerScopeAlarm({
    scopeKey: scopeState.scopeKey,
    scheduledAt: wakeupState.wakeupAt,
  })

  scopeState.alarmScheduledAt = wakeupState.wakeupAt

  return wakeupState
}

async function dispatchControllerForScopeInternal(
  scopeState: ScopeRuntimeState,
  {
    reason = 'dispatch',
    source = 'controller-dispatch',
    allowFallback = false,
    executeNow = true,
    stopIfNoInstruction = false,
    clearBotProtect = false,
    screen,
    isBotProtected,
  }: DispatchScopeOptions = {},
) {
  updateScopeRuntimeContext(scopeState, {
    screen,
    isBotProtected,
  })

  applyBotProtectObservation(scopeState, {
    isBotProtected,
    clearBotProtect,
  })

  if (clearBotProtect && scopeState.botProtectActive !== true) {
    await clearBotProtectInstructions(scopeState, {
      reason,
      source,
    })
  }

  const hasBotProtect = scopeState.botProtectActive
  const dueInstruction = hasBotProtect
    ? createFallbackInstruction(scopeState, {
      screen,
      isBotProtected: true,
      reason: 'bot-protect-active',
      source,
    })
    : await resolveDueExecutionInstruction(scopeState, {
      source,
      reason,
    })
  const smartSessionDecision = !hasBotProtect && !dueInstruction
    ? await resolveSmartSessionDecision(scopeState)
    : null

  if (smartSessionDecision?.activate) {
    const activated = await activateSmartSessionReconnect(
      scopeState,
      smartSessionDecision.activate,
    )

    if (activated) {
      return null
    }
  }

  const instruction = dueInstruction
    || (allowFallback
      ? createFallbackInstruction(scopeState, {
        screen,
        isBotProtected: hasBotProtect,
        reason: hasBotProtect ? 'bot-protect-active' : 'stage-fallback',
        source,
      })
      : null)

  if (!instruction) {
    if (executeNow && !allowFallback && stopIfNoInstruction) {
      await requestStopCurrentInstruction(scopeState, {
        reason: 'no-execution-due',
        source,
      })
    }

    return null
  }

  if (!executeNow) {
    logRunnerController('RESOLVED_NO_EXECUTE', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      instruction,
      reason,
      source,
    })
    return instruction
  }

  if (!scopeState.current || scopeState.status === 'idle' || scopeState.status === 'paused') {
    logRunnerController('DISPATCH_DIRECT', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      instruction,
      reason,
      source,
    })
    await dispatchRunInstruction(scopeState, instruction)
    return instruction
  }

  if (isSameRunInstruction(scopeState.current, instruction)) {
    logRunnerController('DISPATCH_SKIPPED_SAME', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      instruction,
      reason,
      source,
    })
    return instruction
  }

  scopeState.pending = instruction
  logRunnerController('PENDING_SET', {
    scopeKey: scopeState.scopeKey,
    status: scopeState.status,
    current: scopeState.current,
    pending: scopeState.pending,
    instruction,
    reason,
    source,
  })

  if (
    instruction.kind === EXECUTION_KINDS.INCOMING_APPLY
    && shouldDeferIncomingApplyPreemption(scopeState.current)
  ) {
    logRunnerController('PENDING_DEFERRED_INCOMING_APPLY', {
      scopeKey: scopeState.scopeKey,
      status: scopeState.status,
      current: scopeState.current,
      pending: scopeState.pending,
      instruction,
      reason,
      source,
    })
    return instruction
  }

  await requestPauseCurrentInstruction(scopeState, {
    reason: 'controller-preempt',
    source,
  })

  return instruction
}

function extractScopeKeyFromRescheduleDetail(detail: Record<string, unknown>) {
  const compose = asRecord(detail.compose)
  const document = asRecord(detail.document)
  const previous = asRecord(detail.previous)
  const documentCompose = asRecord(document?.compose)
  const previousCompose = asRecord(previous?.compose)
  const execution = asRecord(document?.execution)
  const scope = asRecord(execution?.scope)

  return normalizeString(
    scope?.scopeKey
    ?? compose?.scopeKey
    ?? documentCompose?.scopeKey
    ?? previousCompose?.scopeKey,
  )
}

function shouldDispatchImmediatelyFromDecision(detail: Record<string, unknown>) {
  const decision = asRecord(detail.decision)
  const decisionType = normalizeString(decision?.type)

  return decisionType !== null && IMMEDIATE_DECISION_TYPES.has(decisionType)
}

function getDecisionType(detail: Record<string, unknown>) {
  const decision = asRecord(detail.decision)

  return normalizeString(decision?.type)
}

function createInstructionFromReportSnapshot(
  scopeState: ScopeRuntimeState,
  detail: Record<string, unknown>,
) {
  const snapshot = asRecord(detail.snapshot)
  const execution = asRecord(detail.execution)
  const machine = normalizeString(snapshot?.currentRuntimeName)
    ?? normalizeString(execution?.currentRuntimeName)
    ?? 'game'
  const module = normalizeString(snapshot?.currentPageName)
    ?? normalizeString(execution?.currentPageName)
    ?? scopeState.lastKnownScreen
  const action = normalizeString(detail.action) ?? 'runner-report'

  return {
    machine,
    module: machine === 'solver' ? null : module,
    data: null,
    reason: action,
    source: 'runner-report',
    executionId: null,
    kind: machine === 'solver' ? EXECUTION_KINDS.BOT_PROTECT : null,
    dueAt: null,
    dispatchId: createDispatchId(scopeState.scopeKey),
  } satisfies ControllerRunInstruction
}

function resolveScopeKeyFromRunnerReportDetail(detail: Record<string, unknown>) {
  const senderTabId = normalizeNumber(detail.senderTabId)
  const tabContext = getTabContext(senderTabId)

  if (tabContext?.scopeKey) {
    return tabContext.scopeKey
  }

  const execution = asRecord(detail.execution)

  return normalizeString(execution?.scopeKey)
}

async function handleRunnerReportEvent(
  status: RunnerReportStatus,
  detail: Record<string, unknown>,
) {
  const scopeKey = resolveScopeKeyFromRunnerReportDetail(detail)

  if (!scopeKey) {
    return
  }

  await runScopeTransition(scopeKey, async (scopeState) => {
    updateScopeRuntimeContext(scopeState, {
      senderTabId: normalizeNumber(detail.senderTabId),
      senderWindowId: normalizeNumber(detail.senderWindowId),
    })

    if (status === 'running') {
      scopeState.status = 'running'
      scopeState.pauseRequested = false
      scopeState.current = scopeState.current
        ?? createInstructionFromReportSnapshot(scopeState, detail)

      return
    }

    if (status === 'paused') {
      scopeState.status = 'paused'
      scopeState.pauseRequested = false
      scopeState.current = null
      const ranPending = await runPendingInstructionIfPossible(scopeState)

      if (!ranPending) {
        await dispatchControllerForScopeInternal(scopeState, {
          allowFallback: false,
          executeNow: true,
          reason: 'runner-paused-next',
          source: 'runner-report',
        })
      }

      return
    }

    scopeState.status = 'idle'
    scopeState.pauseRequested = false
    scopeState.current = null
    const ranPending = await runPendingInstructionIfPossible(scopeState)

    if (!ranPending) {
      await dispatchControllerForScopeInternal(scopeState, {
        allowFallback: false,
        executeNow: true,
        reason: 'runner-stopped-next',
        source: 'runner-report',
      })
    }
  })
}

async function handleExecutionRescheduledEvent(
  detail: Record<string, unknown>,
) {
  const scopeKey = extractScopeKeyFromRescheduleDetail(detail)

  if (!scopeKey) {
    return
  }

  const wakeupState = await syncControllerScopeAlarm(scopeKey)
  const decisionType = getDecisionType(detail)

  if (
    shouldDispatchImmediatelyFromDecision(detail)
    || wakeupState.dueNow
    || decisionType === 'clear-wakeup'
  ) {
    await dispatchControllerForScope(scopeKey, {
      allowFallback: false,
      executeNow: true,
      reason: decisionType === 'clear-wakeup'
        ? 'reschedule-clear-wakeup'
        : 'reschedule-immediate',
      source: 'controller-reschedule',
    })

    await syncControllerScopeAlarm(scopeKey)
  }
}

function installRunnerControllerEventListeners() {
  const unsubscribeReschedule = onControllerExecutionEvent(
    EXECUTION_CONTROLLER_EVENTS.EXECUTION_RESCHEDULED,
    (event) => {
      const detail = asRecord(event.detail)

      if (!detail) {
        return
      }

      void handleExecutionRescheduledEvent(detail)
    },
  )

  runnerControllerDisposers.push(unsubscribeReschedule)

  Object.entries(RUNNER_REPORT_STATUS_BY_EVENT).forEach(([eventType, status]) => {
    const unsubscribe = onControllerExecutionEvent(eventType, (event) => {
      const detail = asRecord(event.detail)

      if (!detail) {
        return
      }

      void handleRunnerReportEvent(status, detail)
    })

    runnerControllerDisposers.push(unsubscribe)
  })
}

async function restoreControllerScopeAlarms() {
  const documents = await getAllControllerExecutionDocuments()
  await ensurePreparedContextLoaded()
  const scopeKeys = Array.from(
    new Set(
      [
        ...documents
          .map((document) => normalizeString(
            document.execution?.scope?.scopeKey ?? document.compose.scopeKey
          ))
          .filter((scopeKey): scopeKey is string => scopeKey !== null),
        ...getPreparedContextScopeKeys(),
      ],
    ),
  )

  for (const scopeKey of scopeKeys) {
    const wakeupState = await syncControllerScopeAlarm(scopeKey)

    if (wakeupState.dueNow) {
      await dispatchControllerForScope(scopeKey, {
        allowFallback: false,
        executeNow: true,
        reason: 'startup-due',
        source: 'controller-startup',
      })
    }
  }
}

export async function ensureRunnerControllerInitialized() {
  if (runnerControllerInitialized) {
    return
  }

  runnerControllerInitialized = true

  installRunnerControllerEventListeners()
  await restoreControllerScopeAlarms()
}

export async function dispatchControllerForScope(
  scopeKey?: string | null,
  options: DispatchScopeOptions = {},
) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return null
  }

  await ensureRunnerControllerInitialized()

  return await runScopeTransition(normalizedScopeKey, async (scopeState) => (
    await dispatchControllerForScopeInternal(scopeState, options)
  ))
}

export async function syncControllerScopeAlarm(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return {
      dueNow: false,
      wakeupAt: null,
    } satisfies ScopeWakeupState
  }

  await ensureRunnerControllerInitialized()

  return await runScopeTransition(normalizedScopeKey, async (scopeState) => (
    await syncControllerScopeAlarmInternal(scopeState)
  ))
}

export async function reconcileScopeTrackedInstructions(
  scopeKey?: string | null,
  {
    trackedMachines = [],
    allowedPendingMachines = [],
    allowedPendingExecutionIds = [],
    stopCurrentMachines = [],
    reason = 'tracked-instruction-reconcile',
    source = 'controller-dispatch',
  }: ReconcileScopeTrackedInstructionsOptions = {},
) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return {
      clearedPending: false,
      stoppedCurrent: false,
    }
  }

  const trackedMachineSet = normalizeMachineSet(trackedMachines)

  if (!trackedMachineSet.size) {
    return {
      clearedPending: false,
      stoppedCurrent: false,
    }
  }

  const allowedPendingMachineSet = normalizeMachineSet(allowedPendingMachines)
  const allowedPendingExecutionIdSet = normalizeExecutionIdSet(allowedPendingExecutionIds)
  const stopCurrentMachineSet = normalizeMachineSet(stopCurrentMachines)

  await ensureRunnerControllerInitialized()

  return await runScopeTransition(normalizedScopeKey, async (scopeState) => {
    let clearedPending = false
    let stoppedCurrent = false

    if (
      isTrackedInstructionMachine(scopeState.pending, trackedMachineSet)
      && (
        !isTrackedInstructionMachine(scopeState.pending, allowedPendingMachineSet)
        || (
          allowedPendingExecutionIdSet.size > 0
          && !allowedPendingExecutionIdSet.has(
            getInstructionExecutionId(scopeState.pending) ?? '',
          )
        )
      )
    ) {
      scopeState.pending = null
      clearedPending = true
    }

    if (
      isTrackedInstructionMachine(scopeState.current, stopCurrentMachineSet)
    ) {
      stoppedCurrent = await requestStopCurrentInstruction(scopeState, {
        reason,
        source,
        clearPending: false,
      })
    }

    return {
      clearedPending,
      stoppedCurrent,
    }
  })
}

export async function resolveGameStageInstruction({
  scopeKey,
  shouldStart = true,
  screen = null,
  isBotProtected = false,
  senderTabId = null,
  senderWindowId = null,
}: ResolveGameStageInstructionArgs = {}) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey || shouldStart !== true) {
    return null
  }

  await ensureRunnerControllerInitialized()

  return await runScopeTransition(normalizedScopeKey, async (scopeState) => {
    updateScopeRuntimeContext(scopeState, {
      screen,
      isBotProtected,
      senderTabId,
      senderWindowId,
    })

    await clearReconnectRuntimeIfReturned(scopeState.scopeKey)

    const hasStaleBotProtectState = (
      scopeState.botProtectActive === true
      || isBotProtectInstruction(scopeState.current)
      || isBotProtectInstruction(scopeState.pending)
    )

    if (isBotProtected === true) {
      return await dispatchControllerForScopeInternal(scopeState, {
        allowFallback: true,
        executeNow: false,
        reason: 'bot-protect-active:game-stage',
        source: 'game-stage',
        screen,
        isBotProtected: true,
      })
    }

    if (isBotProtected === false && hasStaleBotProtectState) {
      return await dispatchControllerForScopeInternal(scopeState, {
        allowFallback: true,
        executeNow: false,
        reason: 'bot-protect-cleared:game-stage',
        source: 'game-stage',
        clearBotProtect: true,
        screen,
        isBotProtected: false,
      })
    }

    if (scopeState.pending) {
      return scopeState.pending
    }

    if (scopeState.current && scopeState.status === 'running') {
      return scopeState.current
    }

    return await dispatchControllerForScopeInternal(scopeState, {
      allowFallback: true,
      executeNow: false,
      reason: 'game-stage',
      source: 'game-stage',
      screen,
      isBotProtected,
    })
  })
}

export async function handleControllerAlarm(alarm: chrome.alarms.Alarm) {
  const scopeKey = parseControllerScopeAlarmName(alarm?.name)

  if (!scopeKey) {
    return
  }

  await dispatchControllerForScope(scopeKey, {
    allowFallback: false,
    executeNow: true,
    reason: 'alarm-fired',
    source: 'controller-alarm',
  })

  await syncControllerScopeAlarm(scopeKey)
}

export function getRunnerControllerScopeState(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return null
  }

  const scopeState = scopeRuntimeStateByScope.get(normalizedScopeKey)

  if (!scopeState) {
    return null
  }

  return {
    scopeKey: scopeState.scopeKey,
    status: scopeState.status,
    current: scopeState.current,
    pending: scopeState.pending,
    pauseRequested: scopeState.pauseRequested,
    botProtectActive: scopeState.botProtectActive,
    botProtectDetectedAt: scopeState.botProtectDetectedAt,
    botProtectClearedAt: scopeState.botProtectClearedAt,
    lastKnownScreen: scopeState.lastKnownScreen,
    lastKnownBotProtect: scopeState.lastKnownBotProtect,
    lastKnownTabId: scopeState.lastKnownTabId,
    lastKnownWindowId: scopeState.lastKnownWindowId,
    alarmScheduledAt: scopeState.alarmScheduledAt,
    lastDispatchAt: scopeState.lastDispatchAt,
  }
}

export async function waitForRunnerControllerScopeIdle(scopeKey?: string | null) {
  const normalizedScopeKey = normalizeString(scopeKey)

  if (!normalizedScopeKey) {
    return
  }

  await ensureRunnerControllerInitialized()

  const scopeState = scopeRuntimeStateByScope.get(normalizedScopeKey)

  if (!scopeState) {
    return
  }

  await scopeState.transitionChain.catch(() => {})
}
