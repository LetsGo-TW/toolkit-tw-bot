import type { SWMessage } from '../../types'
import { normalizeNumber, normalizeString } from '../normalize'
import { NOTIFY_MESSAGE_TYPE } from '../message/types'
import { AuthRequestError } from '../world-players/license/issue'
import { sendNtfyMessage } from './providers/ntfy'
import { getTelegramState, sendTelegramMessage } from './providers/telegram'

type NotifyAction =
  | 'telegram.state'
  | 'telegram.send'
  | 'ntfy.send'

type NotifyRequest = Partial<SWMessage> & {
  action?: unknown
  forceLink?: unknown
  forceStatus?: unknown
  message?: unknown
  playerId?: unknown
  topic?: unknown
  world?: unknown
}

function normalizeNotifyAction(value: unknown): NotifyAction | null {
  const action = normalizeString(value)?.toLowerCase()

  switch (action) {
    case 'telegram.state':
    case 'telegram.send':
    case 'ntfy.send':
      return action
    default:
      return null
  }
}

function normalizeMessage(value: unknown) {
  return normalizeString(value)
}

function createNotifyErrorResponse(
  action: NotifyAction | null,
  error: unknown,
) {
  return {
    ok: false,
    type: NOTIFY_MESSAGE_TYPE,
    action,
    error: error instanceof Error
      ? error.message
      : String(error ?? 'Notify request failed'),
    status: error instanceof AuthRequestError
      ? error.status
      : null,
  }
}

export async function handleNotify(request: NotifyRequest = {}) {
  const action = normalizeNotifyAction(request.action)
  const world = normalizeString(request.world)
  const playerId = normalizeNumber(request.playerId)

  if (!action) {
    return createNotifyErrorResponse(null, 'Missing notify action')
  }

  if (!world) {
    return createNotifyErrorResponse(action, 'Missing world')
  }

  if (playerId === null) {
    return createNotifyErrorResponse(action, 'Missing playerId')
  }

  try {
    switch (action) {
      case 'telegram.state': {
        const data = await getTelegramState({
          forceLink: request.forceLink === true,
          forceStatus: request.forceStatus === true,
          playerId,
          world,
        })

        return {
          ok: true,
          type: NOTIFY_MESSAGE_TYPE,
          action,
          data,
        }
      }
      case 'telegram.send': {
        const message = normalizeMessage(request.message)

        if (!message) {
          return createNotifyErrorResponse(action, 'Missing message')
        }

        const result = await sendTelegramMessage({
          message,
          playerId,
          world,
        })

        return {
          ok: true,
          type: NOTIFY_MESSAGE_TYPE,
          action,
          sent: result.sent,
          sentCount: result.sentCount,
        }
      }
      case 'ntfy.send': {
        const topic = normalizeString(request.topic)
        const message = normalizeMessage(request.message)

        if (!topic) {
          return createNotifyErrorResponse(action, 'Missing topic')
        }

        if (!message) {
          return createNotifyErrorResponse(action, 'Missing message')
        }

        const result = await sendNtfyMessage({
          message,
          topic,
        })

        return {
          ok: true,
          type: NOTIFY_MESSAGE_TYPE,
          action,
          sent: result.sent,
        }
      }
      default:
        return createNotifyErrorResponse(action, `Unsupported notify action "${String(action)}"`)
    }
  } catch (error) {
    return createNotifyErrorResponse(action, error)
  }
}
