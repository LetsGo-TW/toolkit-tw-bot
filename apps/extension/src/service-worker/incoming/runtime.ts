/// <reference types="chrome" />

import type { SWMessage } from '../../types'
import {
  EXECUTION_CONTROLLER_EVENTS,
  EXECUTION_KINDS,
  EXECUTION_STATUSES,
  type ControllerIncomingState,
} from '../controller/contract'
import {
  emitControllerEvent,
  handleScriptExecutionSync,
} from '../controller/runtime'
import {
  getScriptStorageDocument,
  putScriptStorageDocument,
} from '../indexdb/script-storage'
import { INCOMING_WATCH_MESSAGE_TYPE } from '../message/types'
import { normalizeNumber, normalizeString } from '../normalize'
import {
  ensurePreparedContextLoaded,
  getTabContext,
} from '../prepared-context'
import {
  ensureWorldPlayersLoaded,
  resolveWorldPlayer,
} from '../world-players'
import { runtimeAllowedByLicense } from '../world-players/runtime'

type IncomingWatchAction = 'observe' | 'queue-apply' | 'apply-completed'

type IncomingWatchRequest = Partial<SWMessage> & {
  action?: unknown
  world?: unknown
  t?: unknown
  playerId?: unknown
  previousCount?: unknown
  currentCount?: unknown
  diffCount?: unknown
  observedAt?: unknown
  pendingTagCount?: unknown
  taggedCount?: unknown
  failedCount?: unknown
}

type ResolvedIncomingContext = {
  scopeKey: string
  world: string
  t: number | null
  playerId: number
  tabId: number | null
  windowId: number | null
}

function createScopeKey(world: string | null, t: number | null) {
  if (!world) {
    return null
  }

  return `${world}:${t ?? 'main'}`
}

function normalizeIncomingWatchAction(value: unknown): IncomingWatchAction {
  const action = normalizeString(value)?.toLowerCase() ?? 'observe'

  if (
    action === 'queue-apply'
    || action === 'apply-completed'
  ) {
    return action
  }

  return 'observe'
}

function normalizeCount(value: unknown) {
  const normalized = normalizeNumber(value)

  if (normalized === null || normalized < 0) {
    return null
  }

  return Math.trunc(normalized)
}

function buildIncomingStateCompose({
  scopeKey,
  world,
  playerId,
}: {
  scopeKey: string
  world: string
  playerId: number
}) {
  return {
    scopeKey,
    world,
    playerId,
    path: ['controller', 'incoming', 'state'],
  }
}

function buildIncomingApplyCompose({
  scopeKey,
  world,
  playerId,
  t,
}: {
  scopeKey: string
  world: string
  playerId: number
  t: number | null
}) {
  return {
    scopeKey,
    world,
    t,
    playerId,
    path: ['controller', 'incoming', 'apply'],
  }
}

function normalizeIncomingState(value: unknown): ControllerIncomingState {
  const candidate = value && typeof value === 'object'
    ? value as Partial<ControllerIncomingState>
    : {}

  return {
    lastObservedAt: normalizeNumber(candidate.lastObservedAt),
    lastObservedCount: normalizeCount(candidate.lastObservedCount),
    lastObservedPreviousCount: normalizeCount(candidate.lastObservedPreviousCount),
    lastObservedDiffCount: normalizeNumber(candidate.lastObservedDiffCount) ?? 0,
    diffPending: candidate.diffPending === true,
    diffCount: normalizeNumber(candidate.diffCount) ?? 0,
    applyQueuedAt: normalizeNumber(candidate.applyQueuedAt),
    observedInTabId: normalizeNumber(candidate.observedInTabId),
    observedInWindowId: normalizeNumber(candidate.observedInWindowId),
  }
}

async function resolveIncomingContext(
  request: IncomingWatchRequest,
  sender?: chrome.runtime.MessageSender,
): Promise<ResolvedIncomingContext | null> {
  await ensurePreparedContextLoaded()
  await ensureWorldPlayersLoaded()

  const tabContext = getTabContext(sender?.tab?.id ?? null)
  const world = normalizeString(request.world) ?? tabContext?.world ?? null
  const t = normalizeNumber(request.t) ?? tabContext?.t ?? null
  const playerId = normalizeNumber(request.playerId) ?? tabContext?.playerId ?? null
  const scopeKey = normalizeString(tabContext?.scopeKey) ?? createScopeKey(world, t)

  if (!world || playerId === null || !scopeKey) {
    return null
  }

  return {
    scopeKey,
    world,
    t,
    playerId,
    tabId: sender?.tab?.id ?? tabContext?.tabId ?? null,
    windowId: sender?.tab?.windowId ?? tabContext?.windowId ?? null,
  }
}

async function readIncomingStateDocument(context: ResolvedIncomingContext) {
  const compose = buildIncomingStateCompose(context)
  const document = await getScriptStorageDocument(compose)

  return {
    compose,
    document,
    state: normalizeIncomingState(document?.data),
  }
}

async function resolveExecutionPermission(context: ResolvedIncomingContext) {
  const worldPlayer = resolveWorldPlayer({
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
  })
  const licenseRuntime = await runtimeAllowedByLicense(worldPlayer)
  const execute = worldPlayer?.enabledByUser !== false
    && licenseRuntime.isAllowedByLicense === true

  return {
    execute,
    license: {
      allowed: licenseRuntime.isAllowedByLicense === true,
      expiring: licenseRuntime.isLicenseExpiring === true,
    },
    worldPlayer,
  }
}

async function syncIncomingApplyExecution({
  context,
  shouldQueue,
}: {
  context: ResolvedIncomingContext
  shouldQueue: boolean
}) {
  const compose = buildIncomingApplyCompose(context)

  if (!shouldQueue) {
    return await handleScriptExecutionSync({
      action: 'delete',
      compose,
    })
  }

  return await handleScriptExecutionSync({
    action: 'upsert',
    compose,
    execution: {
      kind: EXECUTION_KINDS.INCOMING_APPLY,
      status: EXECUTION_STATUSES.QUEUED,
      nextAt: Date.now(),
      payload: {
        module: 'incomingApply',
      },
      reason: 'incoming-watch-pending-tags',
    },
  })
}

async function handleObserveAction(
  request: IncomingWatchRequest,
  sender?: chrome.runtime.MessageSender,
) {
  const context = await resolveIncomingContext(request, sender)

  if (!context) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'observe',
      error: 'Missing incoming observe context',
    }
  }

  const previousCount = normalizeCount(request.previousCount)
  const currentCount = normalizeCount(request.currentCount)
  const observedAt = normalizeNumber(request.observedAt) ?? Date.now()

  if (previousCount === null || currentCount === null) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'observe',
      error: 'Missing incoming counters',
    }
  }

  const { compose, state: previousState } = await readIncomingStateDocument(context)
  const nextDiff = currentCount > previousCount
    ? currentCount - previousCount
    : 0
  const observedDiff = normalizeNumber(request.diffCount) ?? (currentCount - previousCount)
  const nextState: ControllerIncomingState = {
    lastObservedAt: observedAt,
    lastObservedCount: currentCount,
    lastObservedPreviousCount: previousCount,
    lastObservedDiffCount: observedDiff,
    diffPending: previousState.diffPending || nextDiff > 0,
    diffCount: previousState.diffCount + nextDiff,
    applyQueuedAt: previousState.applyQueuedAt,
    observedInTabId: context.tabId,
    observedInWindowId: context.windowId,
  }

  await putScriptStorageDocument({
    compose,
    data: nextState,
  })

  emitControllerEvent(EXECUTION_CONTROLLER_EVENTS.INCOMING_OBSERVED, {
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
    previousCount,
    currentCount,
    diffCount: observedDiff,
    pendingDiffCount: nextState.diffCount,
    observedAt,
    senderTabId: context.tabId,
    senderWindowId: context.windowId,
  })

  const executionPermission = await resolveExecutionPermission(context)

  return {
    ok: true,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'observe',
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
    data: nextState,
    execute: executionPermission.execute,
    reason: executionPermission.execute
      ? 'allowed-by-license'
      : 'license-required',
    license: executionPermission.license,
  }
}

async function handleQueueApplyAction(
  request: IncomingWatchRequest,
  sender?: chrome.runtime.MessageSender,
) {
  const context = await resolveIncomingContext(request, sender)

  if (!context) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'queue-apply',
      error: 'Missing incoming queue context',
    }
  }

  const pendingTagCount = normalizeCount(request.pendingTagCount) ?? 0
  const queuedAt = pendingTagCount > 0 ? Date.now() : null
  const { compose, state: previousState } = await readIncomingStateDocument(context)
  const nextState: ControllerIncomingState = {
    ...previousState,
    diffPending: false,
    diffCount: 0,
    applyQueuedAt: queuedAt,
    observedInTabId: context.tabId ?? previousState.observedInTabId,
    observedInWindowId: context.windowId ?? previousState.observedInWindowId,
  }

  await putScriptStorageDocument({
    compose,
    data: nextState,
  })

  const executionPermission = await resolveExecutionPermission(context)
  const shouldQueue = pendingTagCount > 0 && executionPermission.execute
  const syncResponse = await syncIncomingApplyExecution({
    context,
    shouldQueue,
  })

  if (!syncResponse?.ok) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'queue-apply',
      error: syncResponse?.error || 'Failed to sync incoming apply execution',
    }
  }

  emitControllerEvent(EXECUTION_CONTROLLER_EVENTS.INCOMING_APPLY_PENDING, {
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
    pendingTagCount,
    queued: shouldQueue,
    queuedAt,
  })

  return {
    ok: true,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'queue-apply',
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
    data: nextState,
    pendingTagCount,
    queued: shouldQueue,
    execute: executionPermission.execute,
    reason: shouldQueue
      ? 'incoming-apply-queued'
      : executionPermission.execute
        ? 'incoming-apply-cleared'
        : 'license-required',
    license: executionPermission.license,
  }
}

async function handleApplyCompletedAction(
  request: IncomingWatchRequest,
  sender?: chrome.runtime.MessageSender,
) {
  const context = await resolveIncomingContext(request, sender)

  if (!context) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'apply-completed',
      error: 'Missing incoming apply completion context',
    }
  }

  const pendingTagCount = normalizeCount(request.pendingTagCount) ?? 0
  const taggedCount = normalizeCount(request.taggedCount) ?? 0
  const failedCount = normalizeCount(request.failedCount) ?? 0
  const { compose, state: previousState } = await readIncomingStateDocument(context)
  const nextState: ControllerIncomingState = {
    ...previousState,
    diffPending: false,
    diffCount: 0,
    applyQueuedAt: null,
    observedInTabId: context.tabId ?? previousState.observedInTabId,
    observedInWindowId: context.windowId ?? previousState.observedInWindowId,
  }

  await putScriptStorageDocument({
    compose,
    data: nextState,
  })

  const syncResponse = await syncIncomingApplyExecution({
    context,
    shouldQueue: false,
  })

  if (!syncResponse?.ok) {
    return {
      ok: false,
      type: INCOMING_WATCH_MESSAGE_TYPE,
      action: 'apply-completed',
      error: syncResponse?.error || 'Failed to clear incoming apply execution',
    }
  }

  return {
    ok: true,
    type: INCOMING_WATCH_MESSAGE_TYPE,
    action: 'apply-completed',
    scopeKey: context.scopeKey,
    world: context.world,
    playerId: context.playerId,
    data: nextState,
    pendingTagCount,
    taggedCount,
    failedCount,
    reason: 'incoming-apply-cleared',
  }
}

export async function handleIncomingWatch(
  request: IncomingWatchRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const action = normalizeIncomingWatchAction(request.action)

  if (action === 'queue-apply') {
    return await handleQueueApplyAction(request, sender)
  }

  if (action === 'apply-completed') {
    return await handleApplyCompletedAction(request, sender)
  }

  return await handleObserveAction(request, sender)
}
