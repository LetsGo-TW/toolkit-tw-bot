import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

export const SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE = 'SCRIPT_EXECUTION_SYNC'

async function sendScriptExecutionSyncMessage(payload) {
  const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: SCRIPT_EXECUTION_SYNC_MESSAGE_TYPE,
    ...payload,
  })

  if (!response?.ok) {
    throw new Error(response?.error || 'Script execution sync request failed')
  }

  return response
}

export async function syncScriptExecution({
  action = 'upsert',
  compose,
  execution,
} = {}) {
  return await sendScriptExecutionSyncMessage({
    action,
    compose,
    execution,
  })
}

export async function disableScriptExecution({
  compose,
  execution,
} = {}) {
  return await syncScriptExecution({
    action: 'disable',
    compose,
    execution,
  })
}

export async function deleteScriptExecution(compose) {
  return await syncScriptExecution({
    action: 'delete',
    compose,
  })
}

export const ScriptExecution = {
  sync: syncScriptExecution,
  disable: disableScriptExecution,
  delete: deleteScriptExecution,
}
