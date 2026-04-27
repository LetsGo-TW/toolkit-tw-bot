const DB_NAME = "toolkit_table_production"
const DB_VERSION = 1
const STORE_NAME = "keyval"

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME)
      }
    })
  }
  return dbPromise
}

export async function dbGet(key) {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly")
      const request = transaction.objectStore(STORE_NAME).get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  } catch (err) {
    return null
  }
}

export async function dbSet(key, value) {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const request = transaction.objectStore(STORE_NAME).put(value, key)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
