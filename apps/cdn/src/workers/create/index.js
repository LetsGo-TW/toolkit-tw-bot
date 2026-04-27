const WORKER_CACHE_PREFIX = "toolkit-worker-script:v1"

const cache = {
  blobs: {},
  scripts: {}
}

const getCacheKey = (baseUrl = "", name = "") => [
  WORKER_CACHE_PREFIX,
  String(baseUrl || ""),
  String(name || "")
].join("|")

const looksLikeHtmlResponse = (script = "") => {
  const normalized = String(script || "").trim().toLowerCase()

  if (!normalized) return true

  return normalized.startsWith("<!doctype")
    || normalized.startsWith("<html")
    || normalized.includes("<body")
    || normalized.includes('id="ds_body"')
    || normalized.includes("bot_check")
}

const createBlobFromScript = (script = "") => new Blob([String(script || "")], {
  type: "text/javascript"
})

const fetchWorkerScript = async (url) => {
  const response = await fetch(url, {
    cache: "no-store"
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return await response.text()
}

export const clearWorkerCache = (baseUrl, name) => {
  const cacheKey = getCacheKey(baseUrl, name)

  delete cache.blobs[cacheKey]
  delete cache.scripts[cacheKey]
}

const loadWorkerScript = async (baseUrl, name) => {
  const cacheKey = getCacheKey(baseUrl, name)

  let script = String(cache.scripts[cacheKey] || "")

  if (!script) {
    const url = new URL(`../workers/worker.${name}.js`, baseUrl).toString()
    script = await fetchWorkerScript(url)

    if (looksLikeHtmlResponse(script)) {
      clearWorkerCache(baseUrl, name)
      throw new Error(`Invalid worker script response for "${name}"`)
    }

    cache.scripts[cacheKey] = script
  }

  return {
    cacheKey,
    script
  }
}

export default async (baseUrl, name, blob = null, context = window) => {
  try {
    if (typeof context?.Worker === "undefined") {
      console.debug("Not Worker in window!")
      return { worker: null, blob }
    }

    if (!baseUrl || !name) {
      return { worker: null, blob }
    }

    const cacheKey = getCacheKey(baseUrl, name)
    let cachedBlob = blob || cache.blobs[cacheKey] || null

    if (!cachedBlob) {
      const { script } = await loadWorkerScript(baseUrl, name)
      cachedBlob = createBlobFromScript(script)
      cache.blobs[cacheKey] = cachedBlob
    }

    const workerUrl = context.URL.createObjectURL(cachedBlob)

    try {
      const worker = new context.Worker(workerUrl, {
        name,
        type: "module"
      })

      return { worker, blob: cachedBlob }
    } finally {
      context.URL.revokeObjectURL(workerUrl)
    }
  } catch (error) {
    console.warn(`[Workers/create] fail create worker "${name}"`, error?.message || error)
    return { worker: null, blob }
  }
}
