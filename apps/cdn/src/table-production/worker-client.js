import createWorker from "../workers/create"
import Controller from "./worker/controller"

const PREPARED_BASE_URL_KEY = "__toolkitTwBotPreparedBaseUrl__"

const tableProductionWorkerState = {
  blob: null
}

const resolveWorkerBaseUrl = (options = {}) => {
  if (typeof options?.baseUrl === "string" && options.baseUrl.trim()) {
    return options.baseUrl.trim()
  }

  if (
    typeof window !== "undefined"
    && typeof window[PREPARED_BASE_URL_KEY] === "string"
    && window[PREPARED_BASE_URL_KEY].trim()
  ) {
    return window[PREPARED_BASE_URL_KEY].trim()
  }

  return null
}

const getDefaultUseWorker = () => {
  try {
    return localStorage.getItem("toolkit-table-production-worker") !== "0"
  } catch {
    return true
  }
}

const createTableProductionController = async ({
  useWorker = true,
  baseUrl = null
} = {}) => {
  let worker = null

  if (useWorker) {
    const workerBaseUrl = resolveWorkerBaseUrl({ baseUrl })

    if (workerBaseUrl) {
      const created = await createWorker(
        workerBaseUrl,
        "table-production",
        tableProductionWorkerState.blob,
        window
      )

      worker = created.worker
      tableProductionWorkerState.blob = created.blob
    }
  }

  return Controller.create(worker)
}

export {
  createTableProductionController,
  getDefaultUseWorker,
  resolveWorkerBaseUrl
}
