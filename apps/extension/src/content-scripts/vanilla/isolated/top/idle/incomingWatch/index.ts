/// <reference types="chrome" />

import installIncomingWatchObserver, { type IncomingObservedDetail } from './observer'
import {
  getIncomingBootstrapDetail,
  isIncomingWatchExtensionContextInvalidated,
  isIncomingWatchTransientError,
  installIncomingVisualSync,
  requestIncomingApplyQueue,
  readSaveNotifyIncomings,
  requestIncomingWatchDecision,
} from './runtime'

const BOOTSTRAP_KEY = '__toolkitTwBotIncomingWatch__'
const DRAIN_RETRY_MS = 2500

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

type PendingIncomingTask = {
  detail: IncomingObservedDetail
  decision: Awaited<ReturnType<typeof requestIncomingWatchDecision>> | null
}

let running = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let pendingTask: PendingIncomingTask | null = null

function scheduleDrainRetry(delay = DRAIN_RETRY_MS) {
  if (retryTimer) {
    clearTimeout(retryTimer)
  }

  retryTimer = setTimeout(() => {
    retryTimer = null
    void drainIncomingQueue()
  }, Math.max(0, Number(delay) || 0))
}

async function drainIncomingQueue() {
  if (running) {
    return
  }

  running = true

  try {
    while (pendingTask) {
      const task = pendingTask
      pendingTask = null
      const { detail } = task

      const decision = task.decision ?? await requestIncomingWatchDecision(detail).catch((error) => ({
        ok: false,
        execute: false,
        reason: error instanceof Error ? error.message : String(error),
      }))

      if (decision?.ok !== true || decision?.execute !== true) {
        continue
      }

      let readResult: Awaited<ReturnType<typeof readSaveNotifyIncomings>>

      try {
        readResult = await readSaveNotifyIncomings()
      } catch (error) {
        if (isIncomingWatchTransientError(error)) {
          pendingTask = {
            detail,
            decision,
          }
          scheduleDrainRetry()
          return
        }

        throw error
      }

      const queueResult = await requestIncomingApplyQueue({
        pendingTagCount: readResult?.pendingTagCount ?? 0,
      }).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))

      if (queueResult?.ok !== true) {
        if (!isIncomingWatchExtensionContextInvalidated(queueResult?.error)) {
          console.error("[CS][INCOMING_WATCH][QUEUE_APPLY]", queueResult?.error || "Queue apply failed")
        }
      }
    }
  } catch (error) {
    if (!isIncomingWatchExtensionContextInvalidated(error)) {
      console.error('[CS][INCOMING_WATCH][DRAIN]', error)
    }
  } finally {
    running = false

    if (pendingTask && !retryTimer) {
      void drainIncomingQueue()
    }
  }
}

function onObserved(detail: IncomingObservedDetail) {
  pendingTask = {
    detail,
    decision: null,
  }
  void drainIncomingQueue()
}

async function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  installIncomingWatchObserver({
    onObserved,
  })
  installIncomingVisualSync()

  const bootstrapDetail = await getIncomingBootstrapDetail().catch(() => null)
  if (bootstrapDetail) {
    onObserved(bootstrapDetail)
  }
}

void bootstrap()

export {}
