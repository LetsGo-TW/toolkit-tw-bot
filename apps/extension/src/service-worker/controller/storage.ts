import { createIndexedDbDocStore } from '@toolkit-tw-bot/browser/indexedDb'
import type {
  ControllerExecutionRef,
  ControllerRescheduleDecision,
} from './contract'
import {
  buildScriptStorageDocumentId,
  normalizeScriptStorageCompose,
  type NormalizedScriptStorageCompose,
} from '../indexdb/script-storage'
import { SERVICE_WORKER_DB_NAME, SERVICE_WORKER_DB_VERSION } from '../indexdb/constants'

const CONTROLLER_EXECUTION_STORE_NAME = 'controller-execution'

export type ControllerExecutionDocument = {
  _id: string
  compose: NormalizedScriptStorageCompose
  createdAt: string
  execution: ControllerExecutionRef | null
  kind: 'controller-execution'
  lastAction: 'upsert' | 'delete' | 'disable'
  lastDecision: ControllerRescheduleDecision | null
  updatedAt: string
}

const controllerExecutionStore = createIndexedDbDocStore<ControllerExecutionDocument>({
  dbName: SERVICE_WORKER_DB_NAME,
  indexes: [
    {
      keyPath: 'kind',
      name: 'kind',
      unique: false,
    },
  ],
  storeName: CONTROLLER_EXECUTION_STORE_NAME,
  version: SERVICE_WORKER_DB_VERSION,
})

export function buildControllerExecutionDocumentId(composeValue: unknown) {
  const baseId = buildScriptStorageDocumentId(composeValue)

  if (!baseId) {
    return null
  }

  return `controller:execution:${baseId}`
}

export function normalizeControllerExecutionCompose(composeValue: unknown) {
  return normalizeScriptStorageCompose(composeValue)
}

export async function getControllerExecutionDocument(composeValue: unknown) {
  const _id = buildControllerExecutionDocumentId(composeValue)

  if (!_id) {
    return null
  }

  return await controllerExecutionStore.get(_id)
}

export async function putControllerExecutionDocument({
  compose: composeValue,
  execution,
  action,
  decision,
}: {
  compose: unknown
  execution: ControllerExecutionRef | null
  action: 'upsert' | 'delete' | 'disable'
  decision: ControllerRescheduleDecision | null
}) {
  const compose = normalizeControllerExecutionCompose(composeValue)
  const _id = buildControllerExecutionDocumentId(compose)

  if (!compose || !_id) {
    return null
  }

  const previous = await controllerExecutionStore.get(_id)
  const now = new Date().toISOString()
  const nextDocument: ControllerExecutionDocument = {
    _id,
    compose,
    createdAt: previous?.createdAt ?? now,
    execution,
    kind: 'controller-execution',
    lastAction: action,
    lastDecision: decision,
    updatedAt: now,
  }

  return await controllerExecutionStore.put(nextDocument)
}

export async function removeControllerExecutionDocument(composeValue: unknown) {
  const _id = buildControllerExecutionDocumentId(composeValue)

  if (!_id) {
    return null
  }

  await controllerExecutionStore.remove(_id)

  return _id
}
