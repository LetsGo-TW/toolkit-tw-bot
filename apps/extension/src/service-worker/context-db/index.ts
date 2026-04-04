import { createIndexedDbDocStore } from '@toolkit-tw-bot/browser/indexedDb'
import { normalizeNumber, normalizeString } from '../normalize'
import type { WorldPlayerRecord } from '../world-players'

const SERVICE_WORKER_DB_NAME = 'toolkit-extension-sw'
const SERVICE_WORKER_DB_VERSION = 1
const CONTEXTS_STORE_NAME = 'contexts'

export type ContextDocumentKind =
  | 'ally'
  | 'player'
  | 'user-world-player'
  | 'world-player'

export type ContextDocument = {
  _id: string
  allyId?: number | null
  avatarUrl?: string | null
  createdAt: string
  dateStarted?: number | null
  enabledByUser?: boolean | null
  kind: ContextDocumentKind
  lastWorld?: string | null
  playerId?: number | null
  playerName?: string | null
  reconnectOnSessionExpired?: boolean | null
  scopeKey?: string | null
  updatedAt: string
  userId?: string | null
  world?: string | null
}

const contextStore = createIndexedDbDocStore<ContextDocument>({
  dbName: SERVICE_WORKER_DB_NAME,
  indexes: [
    {
      keyPath: 'kind',
      name: 'kind',
      unique: false,
    },
  ],
  storeName: CONTEXTS_STORE_NAME,
  version: SERVICE_WORKER_DB_VERSION,
})

function readStringField(
  doc: ContextDocument | null,
  key: keyof ContextDocument,
) {
  return normalizeString(doc?.[key]) ?? null
}

async function getContextDocumentById(id: string) {
  return await contextStore.get(id)
}

async function putContextDocument(document: ContextDocument) {
  return await contextStore.put(document)
}

export function getAllyContextId(allyId?: number | null) {
  const normalizedAllyId = normalizeNumber(allyId)

  return normalizedAllyId === null
    ? null
    : `ally:${normalizedAllyId}`
}

export function getPlayerContextId(playerId?: number | null) {
  const normalizedPlayerId = normalizeNumber(playerId)

  return normalizedPlayerId === null
    ? null
    : `player:${normalizedPlayerId}`
}

export function getUserWorldPlayerContextId(
  userId?: string | null,
  world?: string | null,
  playerId?: number | null,
) {
  const normalizedUserId = normalizeString(userId)
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)

  if (!normalizedUserId || !normalizedWorld || normalizedPlayerId === null) {
    return null
  }

  return `user:${normalizedUserId}:world:${normalizedWorld}:player:${normalizedPlayerId}`
}

export function getWorldPlayerContextId(
  world?: string | null,
  playerId?: number | null,
) {
  const normalizedWorld = normalizeString(world)
  const normalizedPlayerId = normalizeNumber(playerId)

  if (!normalizedWorld || normalizedPlayerId === null) {
    return null
  }

  return `world:${normalizedWorld}:player:${normalizedPlayerId}`
}

export async function getContextDocument(id?: string | null) {
  const normalizedId = normalizeString(id)

  if (!normalizedId) {
    return null
  }

  return await getContextDocumentById(normalizedId)
}

async function upsertWorldPlayerContext(record: WorldPlayerRecord) {
  const id = getWorldPlayerContextId(record.world, record.playerId)

  if (!id) {
    return null
  }

  const previous = await getContextDocumentById(id)
  const now = new Date().toISOString()
  const nextDocument: ContextDocument = {
    _id: id,
    avatarUrl: record.avatarUrl ?? readStringField(previous, 'avatarUrl'),
    createdAt: readStringField(previous, 'createdAt') ?? now,
    dateStarted: record.dateStarted ?? previous?.dateStarted ?? null,
    enabledByUser: record.enabledByUser,
    kind: 'world-player',
    playerId: record.playerId,
    reconnectOnSessionExpired: record.reconnectOnSessionExpired,
    scopeKey: record.scopeKey ?? readStringField(previous, 'scopeKey'),
    updatedAt: now,
    world: record.world,
  }

  return await putContextDocument(nextDocument)
}

async function upsertPlayerContext(record: WorldPlayerRecord) {
  const id = getPlayerContextId(record.playerId)

  if (!id) {
    return null
  }

  const previous = await getContextDocumentById(id)
  const now = new Date().toISOString()
  const nextDocument: ContextDocument = {
    _id: id,
    createdAt: readStringField(previous, 'createdAt') ?? now,
    kind: 'player',
    playerId: record.playerId,
    playerName: record.playerName ?? readStringField(previous, 'playerName'),
    updatedAt: now,
  }

  return await putContextDocument(nextDocument)
}

export async function syncWorldPlayerContexts(record: WorldPlayerRecord) {
  return await Promise.all([
    upsertWorldPlayerContext(record),
    upsertPlayerContext(record),
  ])
}
