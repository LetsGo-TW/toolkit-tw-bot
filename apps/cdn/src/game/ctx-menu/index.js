let bootGameCtxMenuPromise = null

export async function bootGameCtxMenuRunning() {
  if (!bootGameCtxMenuPromise) {
    bootGameCtxMenuPromise = import('../../map/menu/villageContextMenu.js')
      .then((module) => {
        module?.bootCtxMenuRunning?.()
      })
      .catch((error) => {
        bootGameCtxMenuPromise = null
        console.error('[GO][game ctx-menu] boot failed', error)
      })
  }

  await bootGameCtxMenuPromise
}
