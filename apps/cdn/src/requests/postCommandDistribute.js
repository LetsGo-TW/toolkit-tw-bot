import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const PLANNER_DISTRIBUTE_MESSAGE_TYPE = 'PLANNER_DISTRIBUTE'

function createAbortError() {
  const error = new Error('Planner distribute request aborted')
  error.name = 'AbortError'
  return error
}

export async function postCommandDistribute({ payload, signal } = {}) {
  if (signal?.aborted) {
    throw createAbortError()
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload inválido para distribuição')
  }

  const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: PLANNER_DISTRIBUTE_MESSAGE_TYPE,
    payload,
  })

  if (!response?.ok) {
    throw new Error(response?.error || 'Falha ao calcular distribuição')
  }

  if (!response?.data || response.data.ok !== true) {
    throw new Error(response?.data?.message || 'Falha ao calcular distribuição')
  }

  return response.data
}
