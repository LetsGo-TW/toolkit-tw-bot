const DISPATCH_WINDOW_MS = 1_000
const DISPATCH_MAX_PER_WINDOW = 5
const dispatchHistoryMs = []

export function resetDispatchRateLimit() {
  dispatchHistoryMs.length = 0
}

function pruneDispatchHistory(nowMs = Date.now()) {
  const minAllowed = nowMs - DISPATCH_WINDOW_MS
  while (dispatchHistoryMs.length > 0 && dispatchHistoryMs[0] <= minAllowed) {
    dispatchHistoryMs.shift()
  }
}

export async function acquireDispatchSlot({
  sleep,
  windowMs = DISPATCH_WINDOW_MS,
  maxPerWindow = DISPATCH_MAX_PER_WINDOW
} = {}) {
  const waitFn = typeof sleep === 'function'
    ? sleep
    : (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const safeWindow = Number.isFinite(Number(windowMs)) ? Math.max(1_000, Math.floor(Number(windowMs))) : DISPATCH_WINDOW_MS
  const safeMax = Number.isFinite(Number(maxPerWindow)) ? Math.max(1, Math.floor(Number(maxPerWindow))) : DISPATCH_MAX_PER_WINDOW

  let waitedMs = 0
  while (true) {
    const now = Date.now()
    pruneDispatchHistory(now)
    if (dispatchHistoryMs.length < safeMax) {
      dispatchHistoryMs.push(now)
      return {
        waitedMs,
        activeInWindow: dispatchHistoryMs.length
      }
    }

    const oldest = dispatchHistoryMs[0]
    const remaining = Math.max(50, safeWindow - (now - oldest))
    waitedMs += remaining
    await waitFn(remaining)
  }
}
