import type { SWMessage } from '../../types'
import {
  createEventBus,
  type EventBusEventDetail,
  type EventBusHandler,
} from './event-bus'
import {
  EXECUTION_GUARD_STATUSES,
  EXECUTION_GUARD_STRATEGIES,
  EXECUTION_CONTROLLER_EVENTS,
  EXECUTION_KINDS,
  EXECUTION_LANES,
  EXECUTION_RULES,
  EXECUTION_STATUSES,
  EXECUTION_TIMING,
  EXECUTION_WAKEUP_POLICIES,
  type ControllerCommandExecutionMeta,
  type ControllerExecutionGuard,
  type ControllerExecutionRef,
  type ControllerRescheduleDecision,
  type ExecutionGuardStatus,
  type ExecutionGuardStrategy,
  type ExecutionKind,
  type ExecutionLane,
  type ExecutionStatus,
  type ExecutionWakeupPolicy,
} from './contract'
import {
  buildControllerExecutionDocumentId,
  getControllerExecutionDocument,
  putControllerExecutionDocument,
  removeControllerExecutionDocument,
} from './storage'
import { normalizeNumber, normalizeString } from '../normalize'
import { SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE } from '../message/types'

type ScriptExecutionSyncAction = 'upsert' | 'delete' | 'disable'

type ScriptExecutionSyncRequest = Partial<SWMessage> & {
  action?: unknown
  compose?: unknown
  execution?: unknown
}

type ScriptExecutionPayload = {
  executionId?: unknown
  kind?: unknown
  status?: unknown
  nextAt?: unknown
  tabId?: unknown
  windowId?: unknown
  startedAt?: unknown
  updatedAt?: unknown
  payload?: unknown
  resumeToken?: unknown
  command?: unknown
  guard?: unknown
  reason?: unknown
}

const executionControllerBus = createEventBus()

function normalizeExecutionSyncAction(value: unknown): ScriptExecutionSyncAction | null {
  const action = normalizeString(value)?.toLowerCase() ?? null

  if (action === 'upsert' || action === 'delete' || action === 'disable') {
    return action
  }

  return null
}

function normalizeExecutionKind(value: unknown): ExecutionKind | null {
  const kind = normalizeString(value) ?? null

  return Object.values(EXECUTION_KINDS).includes(kind as ExecutionKind)
    ? kind as ExecutionKind
    : null
}

function normalizeExecutionStatus(value: unknown): ExecutionStatus | null {
  const status = normalizeString(value) ?? null

  return Object.values(EXECUTION_STATUSES).includes(status as ExecutionStatus)
    ? status as ExecutionStatus
    : null
}

function normalizeExecutionWakeupPolicy(value: unknown): ExecutionWakeupPolicy | null {
  const policy = normalizeString(value) ?? null

  return Object.values(EXECUTION_WAKEUP_POLICIES).includes(policy as ExecutionWakeupPolicy)
    ? policy as ExecutionWakeupPolicy
    : null
}

function normalizeExecutionGuardStrategy(value: unknown): ExecutionGuardStrategy | null {
  const strategy = normalizeString(value) ?? null

  return Object.values(EXECUTION_GUARD_STRATEGIES).includes(strategy as ExecutionGuardStrategy)
    ? strategy as ExecutionGuardStrategy
    : null
}

function normalizeExecutionGuardStatus(value: unknown): ExecutionGuardStatus | null {
  const status = normalizeString(value) ?? null

  return Object.values(EXECUTION_GUARD_STATUSES).includes(status as ExecutionGuardStatus)
    ? status as ExecutionGuardStatus
    : null
}

function resolveExecutionLane(kind: ExecutionKind): ExecutionLane {
  return EXECUTION_RULES[kind]?.lane ?? EXECUTION_LANES.PAGE
}

function normalizeExecutionGuard(value: unknown): ControllerExecutionGuard | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const guard = value as Record<string, unknown>

  return {
    strategy: normalizeExecutionGuardStrategy(guard.strategy)
      ?? EXECUTION_GUARD_STRATEGIES.RUNNER_LEASE,
    status: normalizeExecutionGuardStatus(guard.status)
      ?? EXECUTION_GUARD_STATUSES.IDLE,
    leaseId: normalizeString(guard.leaseId) ?? null,
    runnerTabId: normalizeNumber(guard.runnerTabId),
    runnerWindowId: normalizeNumber(guard.runnerWindowId),
    acquiredAt: normalizeNumber(guard.acquiredAt),
    protectedUntilAt: normalizeNumber(guard.protectedUntilAt),
    lastHeartbeatAt: normalizeNumber(guard.lastHeartbeatAt),
  }
}

function normalizeCommandExecutionMeta({
  kind,
  nextAt,
  value,
}: {
  kind: ExecutionKind
  nextAt: number | null
  value: unknown
}): ControllerCommandExecutionMeta | null {
  if (kind !== EXECUTION_KINDS.COMMAND || nextAt === null) {
    return null
  }

  const command = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const prewakeLeadMs = normalizeNumber(command.prewakeLeadMs) ?? EXECUTION_TIMING.COMMAND_PREWAKE_MS
  const batchWindowMs = normalizeNumber(command.batchWindowMs) ?? EXECUTION_TIMING.COMMAND_BATCH_WINDOW_MS
  const sendAt = normalizeNumber(command.sendAt) ?? nextAt
  const alarmAt = normalizeNumber(command.alarmAt) ?? Math.max(0, sendAt - prewakeLeadMs)
  const batchStartAt = normalizeNumber(command.batchStartAt) ?? sendAt
  const batchEndAt = normalizeNumber(command.batchEndAt) ?? (batchStartAt + batchWindowMs)

  return {
    plannerId: normalizeString(command.plannerId) ?? null,
    commandId: normalizeString(command.commandId) ?? null,
    twCommandId: normalizeString(command.twCommandId) ?? null,
    sourceVillageId: normalizeNumber(command.sourceVillageId),
    targetVillageId: normalizeNumber(command.targetVillageId),
    sendAt,
    alarmAt,
    prewakeLeadMs,
    batchWindowMs,
    batchStartAt,
    batchEndAt,
  }
}

function normalizeExecutionRef({
  compose,
  execution,
}: {
  compose: any
  execution: ScriptExecutionPayload
}): ControllerExecutionRef | null {
  const kind = normalizeExecutionKind(execution.kind)

  if (!kind) {
    return null
  }

  const status = normalizeExecutionStatus(execution.status) ?? EXECUTION_STATUSES.QUEUED
  const updatedAt = normalizeNumber(execution.updatedAt) ?? Date.now()
  const nextAt = normalizeNumber(execution.nextAt)
  const scopeKey = normalizeString(compose?.scopeKey) ?? null
  const world = normalizeString(compose?.world) ?? null
  const playerName = normalizeString(compose?.playerName) ?? null

  return {
    executionId: normalizeString(execution.executionId)
      ?? buildControllerExecutionDocumentId(compose)
      ?? `${kind}:${updatedAt}`,
    kind,
    lane: resolveExecutionLane(kind),
    status,
    scope: {
      scopeKey,
      world,
      t: normalizeNumber(compose?.t),
      playerId: normalizeNumber(compose?.playerId),
      playerName,
    },
    nextAt,
    tabId: normalizeNumber(execution.tabId),
    windowId: normalizeNumber(execution.windowId),
    startedAt: normalizeNumber(execution.startedAt),
    updatedAt,
    wakeupPolicy: normalizeExecutionWakeupPolicy((execution as { wakeupPolicy?: unknown }).wakeupPolicy),
    payload: execution.payload && typeof execution.payload === 'object'
      ? execution.payload as Record<string, unknown>
      : null,
    resumeToken: execution.resumeToken && typeof execution.resumeToken === 'object'
      ? execution.resumeToken as Record<string, unknown>
      : null,
    command: normalizeCommandExecutionMeta({
      kind,
      nextAt,
      value: execution.command,
    }),
    guard: normalizeExecutionGuard(execution.guard),
    reason: normalizeString(execution.reason) ?? null,
  }
}

function resolveExecutionRescheduleDecision(
  execution: ControllerExecutionRef | null,
): ControllerRescheduleDecision {
  if (!execution || execution.nextAt === null) {
    return {
      type: 'clear-wakeup',
      reason: 'missing-next-at',
    }
  }

  const now = Date.now()
  const delayMs = Math.max(0, execution.nextAt - now)
  const rules = EXECUTION_RULES[execution.kind]

  if (execution.kind === EXECUTION_KINDS.BOT_PROTECT) {
    return {
      type: 'dispatch-now',
      reason: 'bot-protect-immediate',
    }
  }

  if (execution.kind === EXECUTION_KINDS.COMMAND) {
    const command = execution.command

    if (!command) {
      return {
        type: 'clear-wakeup',
        reason: 'missing-command-schedule',
      }
    }

    const commandDelayMs = Math.max(0, command.alarmAt - now)

    if (command.alarmAt <= now) {
      return {
        type: 'dispatch-now',
        reason: 'command-prewake-due',
      }
    }

    return {
      type: 'schedule-command-alarm',
      scheduledAt: command.alarmAt,
      delayMs: commandDelayMs,
      sendAt: command.sendAt,
      windowStartAt: command.batchStartAt,
      windowEndAt: command.batchEndAt,
      reason: 'command-alarm-scheduled',
    }
  }

  if (delayMs <= 0) {
    return {
      type: 'dispatch-now',
      reason: 'next-at-due',
    }
  }

  if (
    execution.kind === EXECUTION_KINDS.MINT
    && delayMs <= EXECUTION_TIMING.MINT_SHORT_LOOP_MAX_MS
  ) {
    return {
      type: 'continue-mint-short-delay',
      delayMs,
      reason: 'mint-short-loop',
    }
  }

  if (
    rules.allowsShortWakeup
    && delayMs < EXECUTION_TIMING.RELIABLE_ALARM_MIN_MS
  ) {
    return {
      type: 'page-short-wakeup',
      delayMs,
      reason: 'short-wakeup-supported',
    }
  }

  if (
    rules.minimumAlarmDelayMs !== null
    && delayMs < rules.minimumAlarmDelayMs
  ) {
    return {
      type: 'clamp-and-schedule-alarm',
      scheduledAt: now + rules.minimumAlarmDelayMs,
      delayMs: rules.minimumAlarmDelayMs,
      reason: 'minimum-alarm-clamped',
    }
  }

  return {
    type: 'schedule-alarm',
    scheduledAt: execution.nextAt,
    delayMs,
    reason: 'alarm-scheduled',
  }
}

function emitControllerExecutionEvent(type: string, detail: EventBusEventDetail = null) {
  executionControllerBus.emit(type, detail)
}

export function onControllerExecutionEvent(type: string, handler: EventBusHandler) {
  return executionControllerBus.on(type, handler)
}

export async function handleScriptExecutionSync(
  request: ScriptExecutionSyncRequest = {},
) {
  const action = normalizeExecutionSyncAction(request.action)
  const compose = request.compose
  const previous = await getControllerExecutionDocument(compose)

  if (!action) {
    return {
      ok: false,
      type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
      error: 'Missing script execution sync action',
    }
  }

  if (!buildControllerExecutionDocumentId(compose)) {
    return {
      ok: false,
      type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
      action,
      error: 'Invalid controller execution compose',
    }
  }

  if (action === 'delete') {
    const _id = await removeControllerExecutionDocument(compose)
    const decision: ControllerRescheduleDecision = {
      type: 'clear-wakeup',
      reason: 'execution-deleted',
    }

    emitControllerExecutionEvent(EXECUTION_CONTROLLER_EVENTS.EXECUTION_RESCHEDULED, {
      action,
      _id,
      compose,
      previous,
      document: null,
      decision,
    })

    return {
      ok: true,
      type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
      action,
      _id,
      compose: previous?.compose ?? compose ?? null,
      previous,
      document: null,
      controller: {
        eventType: EXECUTION_CONTROLLER_EVENTS.EXECUTION_RESCHEDULED,
        decision,
      },
    }
  }

  const execution = normalizeExecutionRef({
    compose,
    execution: (request.execution as ScriptExecutionPayload | null) ?? {},
  })

  if (!execution && action === 'upsert') {
    return {
      ok: false,
      type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
      action,
      error: 'Invalid controller execution payload',
    }
  }

  const effectiveExecution = action === 'disable'
    ? execution
      ? {
        ...execution,
        nextAt: null,
        status: EXECUTION_STATUSES.CANCELED,
        wakeupPolicy: EXECUTION_WAKEUP_POLICIES.NONE,
      }
      : null
    : execution

  const decision = resolveExecutionRescheduleDecision(effectiveExecution)
  const document = await putControllerExecutionDocument({
    compose,
    execution: effectiveExecution,
    action,
    decision,
  })

  if (!document) {
    return {
      ok: false,
      type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
      action,
      error: 'Failed to persist controller execution document',
    }
  }

  emitControllerExecutionEvent(EXECUTION_CONTROLLER_EVENTS.EXECUTION_RESCHEDULED, {
    action,
    _id: document._id,
    compose: document.compose,
    previous,
    document,
    decision,
  })

  return {
    ok: true,
    type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
    action,
    _id: document._id,
    compose: document.compose,
    previous,
    document,
    controller: {
      eventType: EXECUTION_CONTROLLER_EVENTS.EXECUTION_RESCHEDULED,
      decision,
    },
  }
}
