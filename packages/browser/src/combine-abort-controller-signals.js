function combineAbortControllerSignals(signals = []) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals.filter(Boolean))
  }

  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort()

  for (const signal of signals) {
    if (!signal) {
      continue
    }

    if (signal.aborted) {
      return AbortSignal.abort()
    }

    signal.addEventListener('abort', onAbort, { once: true })
  }

  return ctrl.signal
}

module.exports = combineAbortControllerSignals
