/// <reference types="chrome" />

import installIncomingWatchObserver, { type IncomingObservedDetail } from './observer'
import {
  requestIncomingApplyQueue,
  readSaveNotifyIncomings,
  requestIncomingWatchDecision,
} from './runtime'

const BOOTSTRAP_KEY = '__toolkitTwBotIncomingWatch__'

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
}

let running = false
let pendingDetail: IncomingObservedDetail | null = null

async function drainIncomingQueue() {
  if (running) {
    return
  }

  running = true

  try {
    while (pendingDetail) {
      const detail = pendingDetail
      pendingDetail = null

      const decision = await requestIncomingWatchDecision(detail).catch((error) => ({
        ok: false,
        execute: false,
        reason: error instanceof Error ? error.message : String(error),
      }))

      if (decision?.ok !== true || decision?.execute !== true) {
        continue
      }

      const readResult = await readSaveNotifyIncomings()
      const queueResult = await requestIncomingApplyQueue({
        pendingTagCount: readResult?.pendingTagCount ?? 0,
      }).catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))

      if (queueResult?.ok !== true) {
        console.error("[CS][INCOMING_WATCH][QUEUE_APPLY]", queueResult?.error || "Queue apply failed")
      }
    }
  } catch (error) {
    console.error('[CS][INCOMING_WATCH][DRAIN]', error)
  } finally {
    running = false

    if (pendingDetail) {
      void drainIncomingQueue()
    }
  }
}

function onObserved(detail: IncomingObservedDetail) {
  pendingDetail = detail
  void drainIncomingQueue()
}

function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  installIncomingWatchObserver({
    onObserved,
  })
}

bootstrap()

export {}
