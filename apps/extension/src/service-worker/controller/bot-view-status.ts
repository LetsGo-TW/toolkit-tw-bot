/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import { getTabContext } from '../prepared-context'
import { normalizeNumber, normalizeString } from '../normalize'
import { GET_BOT_VIEW_STATUS_MESSAGE_TYPE } from '../message/types'
import {
  EXECUTION_KINDS,
} from './contract'
import { resolveNextExecutionForGame } from './next'
import { getRunnerControllerScopeState } from './runner-controller'

type BotViewStatusRequest = Partial<SWMessage>

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

function resolveFallbackNextStatus(controllerScopeState: ReturnType<typeof getRunnerControllerScopeState>) {
  const at = normalizeNumber(controllerScopeState?.pending?.dueAt)
    ?? normalizeNumber(controllerScopeState?.alarmScheduledAt)
  const title = formatExecutionLabel({
    machine: controllerScopeState?.pending?.machine,
    module: controllerScopeState?.pending?.module,
    kind: controllerScopeState?.pending?.kind,
  })

  if (at === null) {
    return null
  }

  return {
    at,
    title,
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
      scopeKey: null,
      nextAt: null,
      nextTitle: null,
    }
  }

  const controllerScopeState = getRunnerControllerScopeState(scopeKey)
  const nextExecution = await resolveNextExecutionForGame({
    scopeKey,
    world: normalizeString(tabContext?.world),
    playerId: normalizeNumber(tabContext?.playerId),
  })
  const fallbackNext = resolveFallbackNextStatus(controllerScopeState)
  const nextAt = nextExecution?.at
    ?? fallbackNext?.at
    ?? null
  const nextTitle = (
    nextExecution
      ? formatExecutionLabel({
        machine: nextExecution.machine,
        module: nextExecution.module,
        kind: nextExecution.kind,
      })
      : null
  ) ?? fallbackNext?.title ?? null

  return {
    ok: true,
    type: GET_BOT_VIEW_STATUS_MESSAGE_TYPE,
    scopeKey,
    nextAt,
    nextTitle,
  }
}
