import show from "./show"

function createAbortError(reason = 'Solver aborted') {
  const error = new Error(reason)
  error.name = 'AbortError'
  return error
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function createSolverControl() {
  let aborted = false
  const cleanups = new Set()

  const runCleanup = async (cleanup) => {
    try {
      await cleanup()
    } catch (error) {
      console.error('[SOLVER][cleanup]', error)
    }
  }

  const onAbort = (cleanup) => {
    if (typeof cleanup !== 'function') {
      return () => {}
    }

    if (aborted) {
      void runCleanup(cleanup)
      return () => {}
    }

    cleanups.add(cleanup)

    return () => {
      cleanups.delete(cleanup)
    }
  }

  const abort = async (detail = {}) => {
    if (aborted) {
      return
    }

    aborted = true

    const pending = Array.from(cleanups)
    cleanups.clear()

    for (const cleanup of pending) {
      await runCleanup(() => cleanup(detail))
    }
  }

  const throwIfAborted = () => {
    if (aborted) {
      throw createAbortError()
    }
  }

  const sleepMs = async (ms) => {
    throwIfAborted()

    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        disposeAbort()
        resolve()
      }, ms)

      const disposeAbort = onAbort(() => {
        clearTimeout(timeoutId)
        reject(createAbortError())
      })
    })
  }

  return {
    abort,
    isAborted: () => aborted,
    onAbort,
    sleepMs,
    sleepSeconds: async (seconds) => await sleepMs(seconds * 1000),
    throwIfAborted,
  }
}

export default async function solver(data, context) {
  const control = createSolverControl()

  context.registerHandle({
    pause: async(detail = {}) => await control.abort({
      ...detail,
      reason: detail?.reason || 'pause',
    }),
    stop: async(detail = {}) => await control.abort({
      ...detail,
      reason: detail?.reason || 'stop',
    }),
    destroy: async(detail = {}) => await control.abort({
      ...detail,
      reason: detail?.reason || 'destroy',
    }),
  })

  await context.reportState('running')

  console.log('SOLVER IS RUNNING')

  try {
    await show({ data, context, control })
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    await context.reportState({
      status: 'failed',
      error,
    })

    throw error
  }
}
