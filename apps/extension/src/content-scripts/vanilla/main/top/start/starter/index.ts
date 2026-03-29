import { starter } from './running'

const START_PROMISE_KEY = '__toolkitTwBotMainTopStartPromise__'
const PIRATE_SCRIPT_MESSAGE = "Let's GO! - Script Pirata / Nao Autorizado Detectado"

type ToolkitWindow = Window & {
  [START_PROMISE_KEY]?: Promise<void>
  Connection?: unknown
  $?: unknown
}

type UserscriptGlobalScope = typeof globalThis & {
  GM_info?: unknown
  GM?: unknown
  unsafeWindow?: unknown
}

function hasUnauthorizedUserscriptRuntime() {
  const runtime = globalThis as UserscriptGlobalScope

  return (
    typeof runtime.GM_info !== 'undefined' ||
    typeof runtime.GM !== 'undefined' ||
    typeof runtime.unsafeWindow !== 'undefined'
  )
}

function triggerPirateScriptTrap(scope: ToolkitWindow) {
  window.setTimeout(() => {
    document.documentElement.innerHTML = `<div style='display:flex;height:100vh;background:#111;color:red;font-size:24px;align-items:center;justify-content:center;font-family:sans-serif;'>${PIRATE_SCRIPT_MESSAGE}</div>`
    scope.Connection = null
    scope.$ = null
  }, 100)
}

async function runOnce() {
  const scope = window as ToolkitWindow

  if (hasUnauthorizedUserscriptRuntime()) {
    triggerPirateScriptTrap(scope)
    return;
  }

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
