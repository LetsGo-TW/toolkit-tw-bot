import { makeAjaxBody, makeAjaxHeadersGetDoc, makeAjaxHeadersPost } from "@toolkit-tw-bot/browser"

export default class Service {
  #abortController = null
  #activeRequestId = null

  static create() {
    return new Service()
  }

  process = {
    stop: ({ cause = "user" } = {}) => {
      this.#abortController?.abort(cause)
    },

    execute: async (data) => {
      await this.process.fetchPages(data)
    },

    fetchPages: async ({
      requestId,
      urls = [],
      onOcurrenceUpdate = () => {},
      onFinishedProcess = () => {},
      onStopedProcess = () => {}
    }) => {
      const abortController = this.#startTask(requestId)

      try {
        for (const url of (Array.isArray(urls) ? urls : [])) {
          const textHtml = await this.#getProductionPageHtml(url, { signal: abortController.signal })

          if (abortController.signal.aborted) {
            throw abortController.signal.reason || new Error("aborted")
          }

          onOcurrenceUpdate({ textHtml, url: String(url || "") })
        }

        if (!abortController.signal.aborted) {
          onFinishedProcess()
        }
      } catch (error) {
        if (abortController.signal.aborted || error?.name === "AbortError") {
          onStopedProcess({
            cause: abortController.signal.reason || error,
            requestId
          })
          return
        }

        throw error
      } finally {
        this.#finishTask(requestId)
      }
    },

    pageSize: async ({
      requestId,
      url,
      payload,
      onOcurrenceUpdate = () => {},
      onFinishedProcess = () => {},
      onStopedProcess = () => {}
    }) => {
      const abortController = this.#startTask(requestId)

      try {
        const textHtml = await this.#setPageSize(url, payload, { signal: abortController.signal })

        if (abortController.signal.aborted) {
          throw abortController.signal.reason || new Error("aborted")
        }

        onOcurrenceUpdate({ textHtml, url: String(url || "") })
        onFinishedProcess()
      } catch (error) {
        if (abortController.signal.aborted || error?.name === "AbortError") {
          onStopedProcess({
            cause: abortController.signal.reason || error,
            requestId
          })
          return
        }

        throw error
      } finally {
        this.#finishTask(requestId)
      }
    }
  }

  #startTask(requestId) {
    this.#abortController?.abort("replaced")

    this.#activeRequestId = requestId
    this.#abortController = new AbortController()

    return this.#abortController
  }

  #finishTask(requestId) {
    if (this.#activeRequestId !== requestId) return

    this.#activeRequestId = null
    this.#abortController = null
  }

  #combineSignals = (signals = []) => {
    const validSignals = signals.filter(Boolean)

    if (!validSignals.length) return null

    if (globalThis?.AbortSignal?.any) {
      return globalThis.AbortSignal.any(validSignals)
    }

    const abortController = new AbortController()
    const abort = (reason) => {
      if (!abortController.signal.aborted) {
        abortController.abort(reason)
      }
    }

    validSignals.forEach((signal) => {
      if (signal.aborted) {
        abort(signal.reason)
        return
      }

      signal.addEventListener("abort", () => abort(signal.reason), { once: true })
    })

    return abortController.signal
  }

  #createTimeoutController = (timeoutMs = 8000) => {
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(new Error("timeout")), timeoutMs)

    return {
      signal: timeoutController.signal,
      cleanup: () => clearTimeout(timeoutId)
    }
  }

  #getProductionPageHtml = async (url, { signal } = {}) => {
    const headers = makeAjaxHeadersGetDoc()
    const timeoutCtrl = this.#createTimeoutController()
    const combinedSignal = this.#combineSignals([signal, timeoutCtrl.signal]) || timeoutCtrl.signal

    const req = new Request(url.toString(), {
      method: "GET",
      headers,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal
    })

    try {
      const response = await fetch(req)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.text()
    } finally {
      timeoutCtrl.cleanup()
    }
  }

  #setPageSize = async (url, payload, { signal } = {}) => {
    const body = makeAjaxBody(payload)
    const headers = makeAjaxHeadersPost()
    const timeoutCtrl = this.#createTimeoutController()
    const combinedSignal = this.#combineSignals([signal, timeoutCtrl.signal]) || timeoutCtrl.signal

    const req = new Request(url.toString(), {
      method: "POST",
      headers,
      body,
      credentials: "include",
      referrerPolicy: "origin",
      cache: "no-store",
      signal: combinedSignal
    })

    try {
      const response = await fetch(req)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.text()
    } finally {
      timeoutCtrl.cleanup()
    }
  }
}
