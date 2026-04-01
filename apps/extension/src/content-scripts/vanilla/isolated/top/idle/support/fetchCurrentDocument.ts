import { combineAbortControllerSignals, makeAjaxHeadersGetDoc } from "@toolkit-tw-bot/browser"

const FETCH_TIMEOUT_MS = 8000

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
  } finally {
    clearTimeout(timeoutId)
  }
}

export { fetchCurrentDocument }
