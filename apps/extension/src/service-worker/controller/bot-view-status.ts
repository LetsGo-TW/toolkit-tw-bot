/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { getTabContext } from '../prepared-context'
import { normalizeNumber, normalizeString } from '../normalize'
import { GET_BOT_VIEW_STATUS_MESSAGE_TYPE } from '../message/types'
import {
  EXECUTION_KINDS,
  EXECUTION_RULES,
  EXECUTION_STATUSES,
  type ControllerExecutionRef,
  type ExecutionStatus,
} from './contract'
import { getRunnerControllerScopeState } from './runner-controller'
import { getControllerExecutionDocumentsByScope } from './storage'

type BotViewStatusRequest = Partial<SWMessage>

const ACTIVE_EXECUTION_STATUSES = new Set<ExecutionStatus>([
  EXECUTION_STATUSES.IDLE,
  EXECUTION_STATUSES.QUEUED,
  EXECUTION_STATUSES.RUNNING,
  EXECUTION_STATUSES.PAUSED,
])

const HUMANIZED_LABELS: Record<string, string> = {
  call: 'Call',
  'call-balancer': 'Call-Balancer',
  callbalancer: 'Call-Balancer',
  farm: 'Farm',
  game: 'Game',
  hcaptcha: 'hCaptcha',
  incoming: 'Incoming',
  'incoming-apply': 'Incoming Apply',
  incomingapply: 'Incoming Apply',
  mint: 'Mint',
  planner: 'Planner',
  report: 'Report',
  settings: 'Settings',
  solver: 'Bot Protect',
}

function humanizeToken(value: unknown) {
  const normalized = normalizeString(value)?.toLowerCase() ?? null

  if (!normalized) {
    return null
  }

  if (HUMANIZED_LABELS[normalized]) {
    return HUMANIZED_LABELS[normalized]
  }

  return normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatExecutionLabel({
  machine,
  module,
  kind,
}: {
  machine?: unknown
  module?: unknown
  kind?: unknown
}) {
  const moduleLabel = humanizeToken(module)
  if (moduleLabel) return moduleLabel

  const machineLabel = humanizeToken(machine)
  if (machineLabel) return machineLabel

  if (kind === EXECUTION_KINDS.BOT_PROTECT) {
    return 'Bot Protect'
  }

  return humanizeToken(kind) ?? null
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

function compareUpcomingExecution(
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

async function resolveNextExecutionByScope(scopeKey: string) {
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
    .sort(compareUpcomingExecution)

  const next = upcoming[0]

  if (!next) {
    return null
  }

  return {
    at: next.wakeupAt,
    title: formatExecutionLabel({
      machine: next.execution.payload?.machine,
      module: next.execution.payload?.module,
      kind: next.execution.kind,
    }),
  }
}

export async function getBotViewStatus(
  _request: BotViewStatusRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const tabId = typeof sender?.tab?.id === 'number' ? sender.tab.id : null
  const tabContext = tabId !== null ? getTabContext(tabId) : null
  const scopeKey = normalizeString(tabContext?.scopeKey)

  if (!scopeKey) {
    return {
      ok: true,
      type: GET_BOT_VIEW_STATUS_MESSAGE_TYPE,
      currentTitle: null,
      scopeKey: null,
      nextAt: null,
      nextTitle: null,
    }
  }

  const controllerScopeState = getRunnerControllerScopeState(scopeKey)
  const currentTitle = formatExecutionLabel({
    machine: controllerScopeState?.current?.machine,
    module: controllerScopeState?.current?.module,
    kind: controllerScopeState?.current?.kind,
  })
  const nextExecution = await resolveNextExecutionByScope(scopeKey)
  const nextTitle = nextExecution?.title
    ?? formatExecutionLabel({
      machine: controllerScopeState?.pending?.machine,
      module: controllerScopeState?.pending?.module,
      kind: controllerScopeState?.pending?.kind,
    })
    ?? null

  return {
    ok: true,
    type: GET_BOT_VIEW_STATUS_MESSAGE_TYPE,
    currentTitle,
    scopeKey,
    nextAt: nextExecution?.at
      ?? normalizeNumber(controllerScopeState?.pending?.dueAt)
      ?? normalizeNumber(controllerScopeState?.alarmScheduledAt),
    nextTitle,
  }
}
