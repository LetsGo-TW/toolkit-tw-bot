import { starter } from './running'

const START_PROMISE_KEY = '__toolkitTwBotMainTopStartPromise__'

type ToolkitWindow = Window & {
  [START_PROMISE_KEY]?: Promise<void>
}

async function runOnce() {
  const scope = window as ToolkitWindow

  if (!scope[START_PROMISE_KEY]) {
    scope[START_PROMISE_KEY] = starter()
      .catch((error) => {
        delete scope[START_PROMISE_KEY]
        throw error
      })
  }

  console.log("[Starter] running")

  return scope[START_PROMISE_KEY]
}

void runOnce()

export {}
