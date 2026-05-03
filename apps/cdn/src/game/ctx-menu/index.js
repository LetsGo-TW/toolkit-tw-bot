import { DynamicBootstrap } from '../../dynamic-bootstrap'

let ctxMenuModulePromise = null

async function getCtxMenuModule() {
  if (!ctxMenuModulePromise) {
    ctxMenuModulePromise = Promise.resolve()
      .then(async() => {
        const ctxMenuLoader = DynamicBootstrap['ctx-menu']

        if (typeof ctxMenuLoader !== 'function') {
          return null
        }

        return await ctxMenuLoader()
      })
      .catch((error) => {
        ctxMenuModulePromise = null
        console.error('[GO][game ctx-menu] boot failed', error)
        return null
      })
  }

  return await ctxMenuModulePromise
}

export async function syncGameCtxMenuRunning() {
  const module = await getCtxMenuModule()
  await module?.syncCtxMenuRunning?.()
}

export async function destroyGameCtxMenuRunning() {
  const module = ctxMenuModulePromise
    ? await ctxMenuModulePromise
    : null
  await module?.destroyCtxMenuBootstrapRunning?.()
}

export async function bootGameCtxMenuRunning() {
  await syncGameCtxMenuRunning()
}
