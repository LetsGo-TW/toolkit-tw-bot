import type { SWMessage } from '../../types'
import { normalizeString } from '../normalize'
import { SCRIPT_STORAGE_MESSAGE_TYPE } from '../message/types'
import {
  buildScriptStorageDocumentId,
  getScriptStorageDocument,
  putScriptStorageDocument,
  removeScriptStorageDocument,
} from './script-storage'

type ScriptStorageRequest = Partial<SWMessage> & {
  action?: unknown
  compose?: unknown
  data?: unknown
}

function normalizeScriptStorageAction(value: unknown) {
  const action = normalizeString(value)?.toLowerCase() ?? null

  if (action === 'post') {
    return 'put'
  }

  return action
}

export async function handleScriptStorage(request: ScriptStorageRequest = {}) {
  const action = normalizeScriptStorageAction(request.action)
  const _id = buildScriptStorageDocumentId(request.compose)

  if (!action) {
    return {
      ok: false,
      type: SCRIPT_STORAGE_MESSAGE_TYPE,
      error: 'Missing script storage action',
    }
  }

  if (!_id) {
    return {
      ok: false,
      type: SCRIPT_STORAGE_MESSAGE_TYPE,
      action,
      error: 'Invalid script storage compose',
    }
  }

  switch (action) {
    case 'get': {
      const document = await getScriptStorageDocument(request.compose)

      return {
        ok: true,
        type: SCRIPT_STORAGE_MESSAGE_TYPE,
        action,
        _id,
        found: document !== null,
        compose: document?.compose ?? null,
        data: document?.data ?? null,
        createdAt: document?.createdAt ?? null,
        updatedAt: document?.updatedAt ?? null,
      }
    }
    case 'put': {
      const document = await putScriptStorageDocument({
        compose: request.compose,
        data: request.data ?? null,
      })

      if (!document) {
        return {
          ok: false,
          type: SCRIPT_STORAGE_MESSAGE_TYPE,
          action,
          error: 'Failed to persist script storage document',
        }
      }

      return {
        ok: true,
        type: SCRIPT_STORAGE_MESSAGE_TYPE,
        action,
        _id: document._id,
        compose: document.compose,
        data: document.data,
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
      }
    }
    case 'delete': {
      await removeScriptStorageDocument(request.compose)

      return {
        ok: true,
        type: SCRIPT_STORAGE_MESSAGE_TYPE,
        action,
        _id,
      }
    }
    default:
      return {
        ok: false,
        type: SCRIPT_STORAGE_MESSAGE_TYPE,
        action,
        error: `Unsupported script storage action "${String(action)}"`,
      }
  }
}
