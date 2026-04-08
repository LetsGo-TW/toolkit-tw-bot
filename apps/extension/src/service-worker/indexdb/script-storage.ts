import { createIndexedDbDocStore } from '@toolkit-tw-bot/browser/indexedDb'
import { normalizeNumber, normalizeString } from '../normalize'
import { SERVICE_WORKER_DB_NAME, SERVICE_WORKER_DB_VERSION } from './constants'

const SCRIPT_STORAGE_STORE_NAME = 'script-storage'

const PRIORITY_COMPOSE_KEYS = [
  'world',
  'playerId',
  'ally',
  'allyId',
  'userId',
  'villageId',
  'groupId',
  'scopeKey',
] as const

const NUMERIC_COMPOSE_KEYS = new Set([
  'playerId',
  'ally',
  'allyId',
  'villageId',
  'groupId',
])

const COMPOSE_LABEL_BY_KEY: Record<string, string> = {
  ally: 'ally',
  allyId: 'ally',
  groupId: 'group',
  playerId: 'player',
  scopeKey: 'scope',
  userId: 'user',
  villageId: 'village',
  world: 'world',
}

export type ScriptStorageCompose = {
  path?: unknown
  [key: string]: unknown
}

export type NormalizedScriptStorageCompose = {
  path: string[]
  [key: string]: string | number | string[] | null | undefined
}

export type ScriptStorageDocument = {
  _id: string
  compose: NormalizedScriptStorageCompose
  createdAt: string
  data: unknown
  kind: 'script-storage'
  updatedAt: string
}

const scriptStorageStore = createIndexedDbDocStore<ScriptStorageDocument>({
  dbName: SERVICE_WORKER_DB_NAME,
  indexes: [
    {
      keyPath: 'kind',
      name: 'kind',
      unique: false,
    },
  ],
  storeName: SCRIPT_STORAGE_STORE_NAME,
  version: SERVICE_WORKER_DB_VERSION,
})

function sanitizeStorageKeySegment(value: string) {
  return value.replace(/:/g, '_').trim()
}

function normalizeStorageKeySegment(value: unknown) {
  const normalizedNumber = normalizeNumber(value)

  if (normalizedNumber !== null) {
    return sanitizeStorageKeySegment(String(normalizedNumber))
  }

  const normalizedString = normalizeString(value)

  if (!normalizedString) {
    return null
  }

  const sanitized = sanitizeStorageKeySegment(normalizedString)

  return sanitized || null
}

function normalizeComposeKey(key: string) {
  const normalized = sanitizeStorageKeySegment(String(key || ''))

  return normalized || null
}

function normalizeComposePath(pathValue: unknown) {
  if (!Array.isArray(pathValue)) {
    return []
  }

  return pathValue
    .map((part) => normalizeStorageKeySegment(part))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
}

export function normalizeScriptStorageCompose(value: unknown): NormalizedScriptStorageCompose | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as ScriptStorageCompose
  const path = normalizeComposePath(candidate.path)

  if (!path.length) {
    return null
  }

  const nextCompose: NormalizedScriptStorageCompose = {
    path,
  }

  Object.entries(candidate).forEach(([key, rawValue]) => {
    if (key === 'path') {
      return
    }

    const normalizedKey = normalizeComposeKey(key)

    if (!normalizedKey) {
      return
    }

    if (NUMERIC_COMPOSE_KEYS.has(normalizedKey)) {
      const normalizedNumericValue = normalizeNumber(rawValue)

      if (normalizedNumericValue !== null) {
        nextCompose[normalizedKey] = normalizedNumericValue
      }

      return
    }

    const normalizedValue = normalizeStorageKeySegment(rawValue)

    if (normalizedValue !== null) {
      nextCompose[normalizedKey] = normalizedValue
    }
  })

  return nextCompose
}

export function buildScriptStorageDocumentId(composeValue: unknown) {
  const compose = normalizeScriptStorageCompose(composeValue)

  if (!compose) {
    return null
  }

  const parts: string[] = []
  const composeKeys = Object.keys(compose)
  const priorityKeys = PRIORITY_COMPOSE_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(compose, key))
  const extraKeys = composeKeys
    .filter((key) => key !== 'path' && !PRIORITY_COMPOSE_KEYS.includes(key as typeof PRIORITY_COMPOSE_KEYS[number]))
    .sort((left, right) => left.localeCompare(right))

  priorityKeys.forEach((key) => {
    const value = compose[key]
    const segment = normalizeStorageKeySegment(value)

    if (segment === null) {
      return
    }

    const label = COMPOSE_LABEL_BY_KEY[key] || key
    parts.push(`${label}:${segment}`)
  })

  extraKeys.forEach((key) => {
    const value = compose[key]
    const normalizedKey = normalizeComposeKey(key)
    const segment = normalizeStorageKeySegment(value)

    if (!normalizedKey || segment === null) {
      return
    }

    parts.push(`${normalizedKey}:${segment}`)
  })

  parts.push(...compose.path)

  return parts.length ? parts.join(':') : null
}

export async function getScriptStorageDocument(composeValue: unknown) {
  const _id = buildScriptStorageDocumentId(composeValue)

  if (!_id) {
    return null
  }

  return await scriptStorageStore.get(_id)
}

export async function putScriptStorageDocument({
  compose: composeValue,
  data,
}: {
  compose: unknown
  data: unknown
}) {
  const compose = normalizeScriptStorageCompose(composeValue)
  const _id = buildScriptStorageDocumentId(compose)

  if (!compose || !_id) {
    return null
  }

  const previous = await scriptStorageStore.get(_id)
  const now = new Date().toISOString()
  const nextDocument: ScriptStorageDocument = {
    _id,
    compose,
    createdAt: previous?.createdAt ?? now,
    data,
    kind: 'script-storage',
    updatedAt: now,
  }

  return await scriptStorageStore.put(nextDocument)
}

export async function removeScriptStorageDocument(composeValue: unknown) {
  const _id = buildScriptStorageDocumentId(composeValue)

  if (!_id) {
    return null
  }

  await scriptStorageStore.remove(_id)

  return _id
}
