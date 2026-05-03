import { DynamicBootstrap } from '../../dynamic-bootstrap'

let collectorModulePromise = null

async function getCollectorModule() {
  if (!collectorModulePromise) {
    collectorModulePromise = Promise.resolve()
      .then(async() => {
        const collectorLoader = DynamicBootstrap.collector

        if (typeof collectorLoader !== 'function') {
          return null
        }

        return await collectorLoader()
      })
      .catch((error) => {
        collectorModulePromise = null
        console.error('[GO][game collector-launcher] boot failed', error)
        return null
      })
  }

  return await collectorModulePromise
}

export async function syncGameCollectorLauncherRunning() {
  const module = await getCollectorModule()
  await module?.syncCollectorRunning?.()
}

export async function destroyGameCollectorLauncherRunning() {
  const module = collectorModulePromise
    ? await collectorModulePromise
    : null
  await module?.destroyCollectorRunning?.()
}

export async function bootGameCollectorLauncherRunning() {
  await syncGameCollectorLauncherRunning()
}
