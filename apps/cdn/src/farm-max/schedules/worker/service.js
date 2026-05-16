import { DOC_REQUEST_TIMEOUT_MS } from "@toolkit-tw-bot/browser";
import { sleep } from "../../utils/sleep"

export default class Service {
  #isRunning = false
  #controller = null
  #dataRun = null

  constructor() {}

  static create() {
    const service = new Service()

    return service
  }

  process = {
    stop: ({ onStoped, ...params }) => {
      this.#isRunning = false
      this.#controller.abort()
      onStoped(params)
    },

    getTextHtml: async ({ onUpdated, onFinished, onError, data }) => {
      const { dataRequests, ...args } = data
      this.#dataRun = { count: 0, textHtml: '', ...args }
      try {
        if (!dataRequests) throw new Error('params dataRequests is required')
        if (this.#isRunning) throw new Error('there is already a process running')

        this.#isRunning = true

        for await (const { url, init } of dataRequests) {
          if (!this.#isRunning) break

          const headers = new Headers(init.headers);

          this.#controller = new AbortController();

          const request = new Request(url, {
            ...init,
            headers,
            signal: this.#controller.signal
          })

          const t = setTimeout(() => this.#controller.abort(), DOC_REQUEST_TIMEOUT_MS);

          try {
            const result = await fetch(request);
            if (!result.ok) onError({ error: `HTTP ${result.status}`});
            this.#dataRun.textHtml = await result.text();
            this.#dataRun.n++
            onUpdated(this.#dataRun);
          } finally {
            clearTimeout(t);
            sleep(201, 251)
          }
        }
      } catch (error) {
        onError({ error: error.message || error.tostring(), ...args })
      } finally {
        onFinished(this.#dataRun)
        this.#isRunning = false
        this.#dataRun = null
        this.#controller = null
      }
    },

    others: 'outros processos'
  }
}
