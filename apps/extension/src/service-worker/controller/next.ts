import { resolveFarmMaxPlannedNext } from '../farm-max'
import { normalizeNumber, normalizeString } from '../normalize'
import {
  EXECUTION_KINDS,
  EXECUTION_RULES,
  EXECUTION_STATUSES,
  type ControllerExecutionRef,
  type ExecutionStatus,
} from './contract'
import { getControllerExecutionDocumentsByScope } from './storage'

export type NextExecutionCandidate = {
  at: number
  kind?: unknown
  machine?: unknown
  module?: unknown
  reason?: string | null
  source: string
}

const ACTIVE_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  EXECUTION_STATUSES.IDLE,
  EXECUTION_STATUSES.QUEUED,
  EXECUTION_STATUSES.RUNNING,
  EXECUTION_STATUSES.PAUSED,
])

const NEXT_SOURCE_PRIORITY: Record<string, number> = {
  controller: 0,
  'farm-max': 100,
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

function compareControllerUpcomingExecution(
  left: {
    execution: ControllerExecutionRef
    wakeupAt: number
  },
  right: {
    execution: ControllerExecutionRef
    wakeupAt: number
  },
) {
  const leftPriority = EXECUTION_RULES[left.execution.kind]?.priority ?? 0
  const rightPriority = EXECUTION_RULES[right.execution.kind]?.priority ?? 0

  if (left.wakeupAt !== right.wakeupAt) {
    return left.wakeupAt - right.wakeupAt
  }

  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority
  }

  return left.execution.updatedAt - right.execution.updatedAt
}

async function resolveControllerNextExecutionByScope(scopeKey: string) {
  const now = Date.now()
  const documents = await getControllerExecutionDocumentsByScope(scopeKey)
  const upcoming = documents
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
    .filter((entry): entry is { execution: ControllerExecutionRef; wakeupAt: number } => (
      entry !== null && entry.wakeupAt > now
    ))
    .sort(compareControllerUpcomingExecution)

  const next = upcoming[0]

  if (!next) {
    return null
  }

  return {
    at: next.wakeupAt,
    kind: next.execution.kind,
    machine: next.execution.payload?.machine,
    module: next.execution.payload?.module,
    reason: next.execution.reason ?? null,
    source: 'controller',
  } satisfies NextExecutionCandidate
}

function compareNextCandidate(
  left: NextExecutionCandidate,
  right: NextExecutionCandidate,
) {
  if (left.at !== right.at) {
    return left.at - right.at
  }

  const leftSourcePriority = NEXT_SOURCE_PRIORITY[left.source] ?? Number.MAX_SAFE_INTEGER
  const rightSourcePriority = NEXT_SOURCE_PRIORITY[right.source] ?? Number.MAX_SAFE_INTEGER

  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority - rightSourcePriority
  }

  return String(left.reason ?? '').localeCompare(String(right.reason ?? ''))
}

function pickNextCandidate(candidates: Array<NextExecutionCandidate | null | undefined>) {
  const normalized = candidates
    .filter((candidate): candidate is NextExecutionCandidate => (
      Boolean(candidate)
      && Number.isFinite(Number(candidate?.at))
      && Number(candidate?.at) > 0
    ))
    .sort(compareNextCandidate)

  return normalized[0] ?? null
}

export async function resolveNextExecutionForGame({
  scopeKey,
  world,
  playerId,
}: {
  scopeKey?: string | null
  world?: string | null
  playerId?: number | null
}) {
  const normalizedScopeKey = normalizeString(scopeKey)
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)

  const [controllerNext, farmMaxNext] = await Promise.all([
    normalizedScopeKey
      ? resolveControllerNextExecutionByScope(normalizedScopeKey)
      : Promise.resolve(null),
    normalizedWorld && normalizedPlayerId !== null
      ? resolveFarmMaxPlannedNext({
        world: normalizedWorld,
        playerId: normalizedPlayerId,
      })
      : Promise.resolve(null),
  ])

  return pickNextCandidate([
    controllerNext,
    farmMaxNext,
  ])
}
