import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

export const SCRIPT_STORAGE_MESSAGE_TYPE = 'SCRIPT_STORAGE'

function normalizeComposePath(path) {
  if (!Array.isArray(path)) {
    return []
  }

  return path
    .map((part) => {
      if (typeof part === 'number' && Number.isFinite(part)) {
        return String(part)
      }

      if (typeof part === 'string' && part.trim()) {
        return part.trim()
      }

      return null
    })
    .filter((part) => typeof part === 'string' && part.length > 0)
}

export function createScriptStorageCompose(compose = {}) {
  if (!compose || typeof compose !== 'object') {
    return {
      path: [],
    }
  }

  return {
    ...compose,
    path: normalizeComposePath(compose.path),
  }
}

async function sendScriptStorageMessage(payload) {
  const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
    extensionId: RELEASE_EXTENSION_ID,
    type: SCRIPT_STORAGE_MESSAGE_TYPE,
    ...payload,
  })

  if (!response?.ok) {
    throw new Error(response?.error || 'Script storage request failed')
  }

  return response
}

export async function getScriptStorage(compose) {
  return await sendScriptStorageMessage({
    action: 'get',
    compose: createScriptStorageCompose(compose),
  })
}

export async function putScriptStorage(compose, data) {
  return await sendScriptStorageMessage({
    action: 'put',
    compose: createScriptStorageCompose(compose),
    data,
  })
}

export async function postScriptStorage(compose, data) {
  return await sendScriptStorageMessage({
    action: 'post',
    compose: createScriptStorageCompose(compose),
    data,
  })
}

export async function deleteScriptStorage(compose) {
  return await sendScriptStorageMessage({
    action: 'delete',
    compose: createScriptStorageCompose(compose),
  })
}

export const ScriptStorage = {
  compose: createScriptStorageCompose,
  delete: deleteScriptStorage,
  get: getScriptStorage,
  post: postScriptStorage,
  put: putScriptStorage,
}
