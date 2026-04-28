import type { SWMessage } from '../../types'
import { normalizeNumber, normalizeString } from '../normalize'
import { getTabContext } from '../prepared-context'
import { AuthRequestError } from '../world-players/license/issue'
import { PLANNER_DISTRIBUTE_MESSAGE_TYPE } from '../message/types'
import { requestPlannerApiJson } from './api'

type PlannerDistributeRequest = Partial<SWMessage> & {
  payload?: unknown
}

function normalizePlannerPayload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function createPlannerDistributeErrorResponse(error: unknown) {
  return {
    ok: false,
    type: PLANNER_DISTRIBUTE_MESSAGE_TYPE,
    error: error instanceof Error
      ? error.message
      : String(error ?? 'Planner distribute request failed'),
    status: error instanceof AuthRequestError
      ? error.status
      : null,
  }
}

export async function handlePlannerDistribute(
  request: PlannerDistributeRequest = {},
  sender?: chrome.runtime.MessageSender,
) {
  const payload = normalizePlannerPayload(request.payload)

  if (!payload) {
    return createPlannerDistributeErrorResponse('Missing planner distribute payload')
  }

  const tabId = typeof sender?.tab?.id === 'number' ? sender.tab.id : null
  const tabContext = tabId !== null ? getTabContext(tabId) : null
  const world = normalizeString(tabContext?.world)
  const playerId = normalizeNumber(tabContext?.playerId)

  if (!world) {
    return createPlannerDistributeErrorResponse('Missing planner world context')
  }

  if (playerId === null) {
    return createPlannerDistributeErrorResponse('Missing planner player context')
  }

  try {
    const data = await requestPlannerApiJson({
      pathname: '/api/commands/distribute',
      method: 'POST',
      body: payload,
      playerId,
      world,
    })

    return {
      ok: true,
      type: PLANNER_DISTRIBUTE_MESSAGE_TYPE,
      data,
    }
  } catch (error) {
    return createPlannerDistributeErrorResponse(error)
  }
}
