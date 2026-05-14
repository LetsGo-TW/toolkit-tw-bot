export declare function combineAbortControllerSignals(
  signals?: Array<AbortSignal | null | undefined>,
): AbortSignal

export declare const DOC_REQUEST_TIMEOUT_MS: number

export declare const SCRIPT_STORAGE_MESSAGE_TYPE: 'SCRIPT_STORAGE'

export type ScriptStorageCompose = {
  path?: unknown
  [key: string]: unknown
}

export type NormalizedScriptStorageCompose = {
  path: string[]
  [key: string]: unknown
}

export declare function createScriptStorageCompose(
  compose?: ScriptStorageCompose,
): NormalizedScriptStorageCompose

export declare function getScriptStorage(
  compose: ScriptStorageCompose,
): Promise<any>

export declare function putScriptStorage(
  compose: ScriptStorageCompose,
  data: unknown,
): Promise<any>

export declare function postScriptStorage(
  compose: ScriptStorageCompose,
  data: unknown,
): Promise<any>

export declare function deleteScriptStorage(
  compose: ScriptStorageCompose,
): Promise<any>

export declare const ScriptStorage: {
  compose: typeof createScriptStorageCompose
  delete: typeof deleteScriptStorage
  get: typeof getScriptStorage
  post: typeof postScriptStorage
  put: typeof putScriptStorage
}

export declare const StorageLocalCompat: {
  create(compose?: ScriptStorageCompose): {
    exists(): Promise<boolean>
    get(): Promise<any>
    set(data: unknown): Promise<any>
    remove(): Promise<void>
  }
}

export type IndexedDbIndexConfig = {
  name: string
  keyPath: string | string[]
  unique?: boolean
}

export type IndexedDbDoc = {
  _id: string
  [key: string]: unknown
}

export type IndexedDbDocStore<TDoc extends IndexedDbDoc = IndexedDbDoc> = {
  clear(): Promise<void>
  get(id: string): Promise<TDoc | null>
  getAll(): Promise<TDoc[]>
  getAllByIndex(indexName: string, query?: IDBValidKey | IDBKeyRange | null): Promise<TDoc[]>
  getAllByPrefix(prefix: string): Promise<TDoc[]>
  openDb(): Promise<IDBDatabase>
  put(doc: TDoc): Promise<TDoc>
  remove(id: string): Promise<void>
}

export declare function createIndexedDbDocStore<TDoc extends IndexedDbDoc = IndexedDbDoc>(config: {
  dbName: string
  storeName: string
  version?: number
  indexes?: IndexedDbIndexConfig[]
}): IndexedDbDocStore<TDoc>

export declare function makeAjaxHeadersPost(): Headers
export declare function makeAjaxHeadersGet(): Headers
export declare function makeAjaxHeadersGetDoc(): Headers
export declare function makeAjaxBody(
  payload?: Array<[string, string | number | null | undefined]> | Record<string, unknown>,
): URLSearchParams
