import createWorker from "../workers/create"
import Controller from "./worker/controller"

const PREPARED_BASE_URL_KEY = "__toolkitTwBotPreparedBaseUrl__"

const tableTraderWorkerState = {
  blob: null
}

const resolveWorkerBaseUrl = (options = {}) => {
  if (typeof options?.baseUrl === "string" && options.baseUrl.trim()) {
    return options.baseUrl.trim()
  }

  if (typeof options?.root === "string" && options.root.trim()) {
    return options.root.trim()
  }

  if (
    typeof window !== "undefined"
    && typeof window[PREPARED_BASE_URL_KEY] === "string"
    && window[PREPARED_BASE_URL_KEY].trim()
  ) {
    return window[PREPARED_BASE_URL_KEY].trim()
  }

  if (typeof window !== "undefined" && typeof window.__GO_WORKER_ROOT === "string" && window.__GO_WORKER_ROOT.trim()) {
    return window.__GO_WORKER_ROOT.trim()
  }

  return null
}

const getDefaultUseWorker = () => {
  try {
    return localStorage.getItem("toolkit-table-trader-worker") !== "0"
  } catch {
    return true
  }
}

const createTableTraderController = async ({
  useWorker = true,
  baseUrl = null,
  root = null
} = {}) => {
  let worker = null

  if (useWorker) {
    const workerBaseUrl = resolveWorkerBaseUrl({ baseUrl, root })

    if (workerBaseUrl) {
      const created = await createWorker(
        workerBaseUrl,
        "table-trader",
        tableTraderWorkerState.blob,
        window
      )

      worker = created.worker
      tableTraderWorkerState.blob = created.blob
    }
  }

  return Controller.create(worker)
}

export {
  createTableTraderController,
  getDefaultUseWorker,
  resolveWorkerBaseUrl
}
