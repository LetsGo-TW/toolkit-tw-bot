function createIndexedDbError(message, cause) {
  const error = new Error(message)

  if (typeof cause !== 'undefined') {
    error.cause = cause
  }

  return error
}

function createStoreRequestError(action, storeName, key, error) {
  return createIndexedDbError(
    `[IndexedDB] failed to ${action} in store "${storeName}" for key "${String(key)}"`,
    error,
  )
}

function createIndexedDbDocStore({
  dbName,
  storeName,
  version = 1,
  indexes = [],
}) {
  if (!dbName) {
    throw new Error('createIndexedDbDocStore: dbName is required')
  }

  if (!storeName) {
    throw new Error('createIndexedDbDocStore: storeName is required')
  }

  let dbPromise = null

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
          reject(createIndexedDbError('IndexedDB is not available in this runtime'))
          return
        }

        const request = indexedDB.open(dbName, version)

        request.onupgradeneeded = () => {
          const database = request.result
          const store = database.objectStoreNames.contains(storeName)
            ? request.transaction.objectStore(storeName)
            : database.createObjectStore(storeName, { keyPath: '_id' })

          indexes.forEach((index) => {
            if (!index?.name || !index?.keyPath) {
              return
            }

            if (!store.indexNames.contains(index.name)) {
              store.createIndex(index.name, index.keyPath, {
                unique: index.unique === true,
              })
            }
          })
        }

        request.onsuccess = () => {
          const database = request.result

          database.onversionchange = () => {
            database.close()
            dbPromise = null
          }

          resolve(database)
        }

        request.onerror = () => {
          reject(
            createIndexedDbError(
              `Failed to open IndexedDB "${dbName}"`,
              request.error,
            ),
          )
        }

        request.onblocked = () => {
          reject(
            createIndexedDbError(`IndexedDB open request for "${dbName}" was blocked`),
          )
        }
      })
    }

    return dbPromise
  }

  async function get(id) {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(id)
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      request.onsuccess = () => {
        if (settled) {
          return
        }

        settled = true
        resolve(request.result ?? null)
      }

      request.onerror = () => {
        rejectOnce(createStoreRequestError('read', storeName, id, request.error))
      }

      transaction.onabort = () => {
        rejectOnce(createStoreRequestError('read', storeName, id, transaction.error))
      }
    })
  }

  async function put(doc) {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put(doc)
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      transaction.oncomplete = () => {
        if (settled) {
          return
        }

        settled = true
        resolve(doc)
      }

      request.onerror = () => {
        rejectOnce(createStoreRequestError('write', storeName, doc?._id, request.error))
      }

      transaction.onabort = () => {
        rejectOnce(createStoreRequestError('write', storeName, doc?._id, transaction.error))
      }
    })
  }

  async function remove(id) {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(id)
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      transaction.oncomplete = () => {
        if (settled) {
          return
        }

        settled = true
        resolve()
      }

      request.onerror = () => {
        rejectOnce(createStoreRequestError('delete', storeName, id, request.error))
      }

      transaction.onabort = () => {
        rejectOnce(createStoreRequestError('delete', storeName, id, transaction.error))
      }
    })
  }

  async function getAll() {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      request.onsuccess = () => {
        if (settled) {
          return
        }

        settled = true
        resolve(Array.isArray(request.result) ? request.result : [])
      }

      request.onerror = () => {
        rejectOnce(createIndexedDbError(`[IndexedDB] failed to read all docs from "${storeName}"`, request.error))
      }

      transaction.onabort = () => {
        rejectOnce(createIndexedDbError(`[IndexedDB] aborted while reading all docs from "${storeName}"`, transaction.error))
      }
    })
  }

  async function getAllByIndex(indexName, query = null) {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const index = store.index(indexName)
      const request = query === null ? index.getAll() : index.getAll(query)
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      request.onsuccess = () => {
        if (settled) {
          return
        }

        settled = true
        resolve(Array.isArray(request.result) ? request.result : [])
      }

      request.onerror = () => {
        rejectOnce(
          createIndexedDbError(
            `[IndexedDB] failed to read index "${indexName}" from "${storeName}"`,
            request.error,
          ),
        )
      }

      transaction.onabort = () => {
        rejectOnce(
          createIndexedDbError(
            `[IndexedDB] aborted while reading index "${indexName}" from "${storeName}"`,
            transaction.error,
          ),
        )
      }
    })
  }

  async function getAllByPrefix(prefix) {
    const normalizedPrefix = String(prefix || '')

    if (!normalizedPrefix) {
      return []
    }

    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const range = IDBKeyRange.bound(
        normalizedPrefix,
        `${normalizedPrefix}\uffff`,
      )
      const request = store.openCursor(range)
      const docs = []
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      request.onsuccess = () => {
        const cursor = request.result

        if (!cursor) {
          if (settled) {
            return
          }

          settled = true
          resolve(docs)
          return
        }

        docs.push(cursor.value)
        cursor.continue()
      }

      request.onerror = () => {
        rejectOnce(
          createIndexedDbError(
            `[IndexedDB] failed to read prefix "${normalizedPrefix}" from "${storeName}"`,
            request.error,
          ),
        )
      }

      transaction.onabort = () => {
        rejectOnce(
          createIndexedDbError(
            `[IndexedDB] aborted while reading prefix "${normalizedPrefix}" from "${storeName}"`,
            transaction.error,
          ),
        )
      }
    })
  }

  async function clear() {
    const db = await openDb()

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.clear()
      let settled = false

      function rejectOnce(error) {
        if (settled) {
          return
        }

        settled = true
        reject(error)
      }

      transaction.oncomplete = () => {
        if (settled) {
          return
        }

        settled = true
        resolve()
      }

      request.onerror = () => {
        rejectOnce(createIndexedDbError(`[IndexedDB] failed to clear "${storeName}"`, request.error))
      }

      transaction.onabort = () => {
        rejectOnce(createIndexedDbError(`[IndexedDB] aborted while clearing "${storeName}"`, transaction.error))
      }
    })
  }

  return {
    clear,
    get,
    getAll,
    getAllByIndex,
    getAllByPrefix,
    openDb,
    put,
    remove,
  }
}

module.exports = {
  createIndexedDbDocStore,
}
