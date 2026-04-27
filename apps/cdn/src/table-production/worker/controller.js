import Service from "./service"

const createAbortError = (cause) => {
  if (cause instanceof Error) {
    if (!cause.name || cause.name === "Error") {
      cause.name = "AbortError"
    }
    return cause
  }

  const error = new Error(String(cause || "aborted"))
  error.name = "AbortError"
  return error
}

const deserializeWorkerError = (error = {}) => {
  const runtimeError = new Error(error?.message || "table-production worker failed")

  runtimeError.name = error?.name || "Error"

  if (error?.stack) {
    runtimeError.stack = error.stack
  }

  return runtimeError
}

export default class Controller {
  #service
  #worker
  #pendingById = new Map()
  #readyPromise
  #resolveReady
  #readyResolved = false

  constructor(worker = null) {
    this.#worker = worker || null
    this.#service = worker ? null : Service.create()
    this.#readyPromise = new Promise((resolve) => {
      this.#resolveReady = resolve
    })

    this.#configureRuntime()
  }

  static create(worker) {
    return new Controller(worker)
  }

  ready() {
    return this.#readyPromise
  }

  async fetchPages({ urls = [], onOcurrenceUpdate = () => {} } = {}) {
    return await this.#request({
      type: "fetchPages",
      urls,
      onOcurrenceUpdate
    })
  }

  async pageSize({ url = "", payload = null, onOcurrenceUpdate = () => {} } = {}) {
    return await this.#request({
      type: "pageSize",
      url,
      payload,
      onOcurrenceUpdate
    })
  }

  stop({ cause = "user" } = {}) {
    if (this.#worker) {
      this.#worker.postMessage({ type: "stop", cause })
      return
    }

    const stopHandler = this.#service?.process?.stop

    if (typeof stopHandler === "function") {
      stopHandler({ type: "stop", cause })
    }
  }

  terminate() {
    if (this.#worker) {
      this.#worker.onmessage = null
      this.#worker.onerror = null
      this.#worker.terminate()
      this.#worker = null
    } else {
      this.#service?.process?.stop({ type: "stop", cause: "terminated" })
    }

    this.#pendingById.forEach(({ reject }) => reject(createAbortError("terminated")))
    this.#pendingById.clear()
  }

  #configureRuntime() {
    if (this.#worker) {
      this.#worker.onmessage = ({ data }) => this.#handleRuntimeMessage(data)
      this.#worker.onerror = (event) => {
        this.#handleRuntimeError(event?.error || new Error(event?.message || "table-production worker runtime error"))
      }
      return
    }

    queueMicrotask(() => this.#resolveRuntimeReady())
  }

  #resolveRuntimeReady() {
    if (this.#readyResolved) return

    this.#readyResolved = true
    this.#resolveReady?.()
  }

  #request({
    type,
    onOcurrenceUpdate = () => {},
    ...payload
  }) {
    const requestId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2)}`

    return new Promise((resolve, reject) => {
      this.#pendingById.set(requestId, {
        resolve,
        reject,
        onOcurrenceUpdate,
        lastData: null
      })

      if (this.#worker) {
        this.#worker.postMessage({ requestId, type, ...payload })
        return
      }

      const handler = this.#service?.process?.[type]

      if (typeof handler !== "function") {
        this.#pendingById.delete(requestId)
        reject(new Error(`Unknown table-production worker process: ${type}`))
        return
      }

      Promise.resolve(handler({
        requestId,
        type,
        ...payload,
        onOcurrenceUpdate: (args = {}) => {
          this.#handleRuntimeMessage({ eventType: "ocurrenceUpdate", requestId, type, ...args })
        },
        onFinishedProcess: (args = {}) => {
          this.#handleRuntimeMessage({ eventType: "finishedProcess", requestId, type, ...args })
        },
        onStopedProcess: (args = {}) => {
          this.#handleRuntimeMessage({
            eventType: "terminate",
            requestId: args?.requestId || requestId,
            type,
            ...args
          })
        }
      })).catch((error) => {
        if (!this.#pendingById.has(requestId)) return

        this.#pendingById.delete(requestId)
        reject(error)
      })
    })
  }

  #handleRuntimeMessage(data = {}) {
    if (data?.eventType === "alive") {
      this.#resolveRuntimeReady()
      return
    }

    const requestId = String(data?.requestId || "")
    const pending = this.#pendingById.get(requestId)

    if (!pending) return

    switch (data?.eventType) {
      case "ocurrenceUpdate":
        pending.lastData = data
        pending.onOcurrenceUpdate(data)
        return
      case "finishedProcess":
        this.#pendingById.delete(requestId)
        pending.resolve(pending.lastData || data)
        return
      case "terminate":
        this.#pendingById.delete(requestId)
        pending.reject(createAbortError(data?.cause))
        return
      case "error":
        this.#pendingById.delete(requestId)
        pending.reject(deserializeWorkerError(data?.error))
        return
      default:
        return
    }
  }

  #handleRuntimeError(error) {
    const runtimeError = error instanceof Error
      ? error
      : new Error(String(error || "table-production runtime error"))

    this.#pendingById.forEach(({ reject }) => reject(runtimeError))
    this.#pendingById.clear()
  }
}
