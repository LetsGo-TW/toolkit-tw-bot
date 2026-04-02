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
