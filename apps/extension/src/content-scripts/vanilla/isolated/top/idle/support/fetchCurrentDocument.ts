import { combineAbortControllerSignals, DOC_REQUEST_TIMEOUT_MS, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser";

const FETCH_TIMEOUT_MS = DOC_REQUEST_TIMEOUT_MS

class FetchCurrentDocumentTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timeout fetching document after ${timeoutMs}ms`)
    this.name = 'FetchCurrentDocumentTimeoutError'
  }
}

function isFetchCurrentDocumentTimeoutError(error: unknown): error is FetchCurrentDocumentTimeoutError {
  return error instanceof FetchCurrentDocumentTimeoutError
    || (
      error instanceof Error
      && error.name === 'FetchCurrentDocumentTimeoutError'
    )
}

async function fetchCurrentDocument(url: string, {
  signal,
}: {
  signal?: AbortSignal
} = {}) {
  const timeoutCtrl = new AbortController()
  const timeoutId = setTimeout(() => timeoutCtrl.abort(new Error('timeout')), FETCH_TIMEOUT_MS)
  const combinedSignal = signal
    ? combineAbortControllerSignals([signal, timeoutCtrl.signal])
    : timeoutCtrl.signal

  const request = new Request(url, {
    method: 'GET',
    headers: makeAjaxHeadersGetDoc(),
    credentials: 'include',
    referrerPolicy: 'origin',
    cache: 'no-store',
    signal: combinedSignal,
  })

  try {
    const response = await fetch(request)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const htmlText = await response.text()
    const html = new DOMParser().parseFromString(htmlText, 'text/html')

    return {
      html,
    }
  } catch (error) {
    if (timeoutCtrl.signal.aborted && signal?.aborted !== true) {
      throw new FetchCurrentDocumentTimeoutError(FETCH_TIMEOUT_MS)
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export {
  fetchCurrentDocument,
  isFetchCurrentDocumentTimeoutError,
}
