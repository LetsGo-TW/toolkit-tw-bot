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
  console.log('[Workers/create] fetching worker script', { url })
  const response = await fetch(url, {
    cache: "no-store"
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const script = await response.text()

  console.log('[Workers/create] fetched worker script', {
    url,
    length: script.length,
    preview: script.slice(0, 120)
  })

  return script
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
      console.log("[Workers/create] Worker API unavailable in context", {
        name,
        baseUrl
      })
      return { worker: null, blob }
    }

    if (!baseUrl || !name) {
      console.log('[Workers/create] missing baseUrl or name', {
        baseUrl,
        name
      })
      return { worker: null, blob }
    }

    const cacheKey = getCacheKey(baseUrl, name)
    let cachedBlob = blob || cache.blobs[cacheKey] || null

    console.log('[Workers/create] starting worker bootstrap', {
      name,
      baseUrl,
      cacheKey,
      hasIncomingBlob: Boolean(blob),
      hasCachedBlob: Boolean(cache.blobs[cacheKey]),
      hasCachedScript: Boolean(cache.scripts[cacheKey])
    })

    if (!cachedBlob) {
      const { script } = await loadWorkerScript(baseUrl, name)
      cachedBlob = createBlobFromScript(script)
      cache.blobs[cacheKey] = cachedBlob

      console.log('[Workers/create] created blob from fetched script', {
        name,
        baseUrl,
        cacheKey,
        blobSize: cachedBlob.size,
        blobType: cachedBlob.type
      })
    } else {
      console.log('[Workers/create] reusing cached blob', {
        name,
        baseUrl,
        cacheKey,
        blobSize: cachedBlob.size,
        blobType: cachedBlob.type
      })
    }

    const workerUrl = context.URL.createObjectURL(cachedBlob)

    console.log('[Workers/create] created worker object URL', {
      name,
      baseUrl,
      cacheKey,
      workerUrl
    })

    try {
      const worker = new context.Worker(workerUrl, {
        name,
        type: "module"
      })

      console.log('[Workers/create] worker constructed', {
        name,
        baseUrl,
        cacheKey,
        workerUrl
      })

      return { worker, blob: cachedBlob }
    } finally {
      context.URL.revokeObjectURL(workerUrl)

      console.log('[Workers/create] revoked worker object URL', {
        name,
        baseUrl,
        cacheKey,
        workerUrl
      })
    }
  } catch (error) {
    console.warn(`[Workers/create] fail create worker "${name}"`, {
      baseUrl,
      error: error?.message || error,
      stack: error?.stack || null
    })
    return { worker: null, blob }
  }
}
