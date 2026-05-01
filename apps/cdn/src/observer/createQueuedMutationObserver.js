export function createQueuedMutationObserver(
  onFlush,
  {
    target = null,
    options = { childList: true, subtree: true },
    immediate = true,
    onError = null
  } = {}
) {
  if (typeof onFlush !== "function") {
    throw new Error("createQueuedMutationObserver requires an onFlush function")
  }

  let destroyed = false
  let runningPromise = null
  let queued = false

  const reportError = (error) => {
    if (typeof onError === "function") {
      onError(error)
      return
    }
    console.error("[queued-mutation-observer]", error)
  }

  const flush = async () => {
    if (destroyed) return

    if (runningPromise) {
      queued = true
      return await runningPromise
    }

    runningPromise = (async() => {
      do {
        queued = false
        if (destroyed) return
        await onFlush()
      } while (queued && !destroyed)
    })()
      .catch((error) => {
        reportError(error)
      })
      .finally(() => {
        runningPromise = null
      })

    return await runningPromise
  }

  const schedule = () => {
    void flush()
  }

  const observer = new MutationObserver(() => {
    schedule()
  })

  if (target?.nodeType) {
    observer.observe(target, options)
  }

  if (immediate) {
    schedule()
  }

  return {
    flush,
    disconnect() {
      destroyed = true
      observer.disconnect()
    }
  }
}
