import { DynamicBootstrap } from '../../dynamic-bootstrap'

let composerModulePromise = null

async function getComposerModule() {
  if (!composerModulePromise) {
    composerModulePromise = Promise.resolve()
      .then(async() => {
        const composerLoader = DynamicBootstrap.composer

        if (typeof composerLoader !== 'function') {
          return null
        }

        return await composerLoader()
      })
      .catch((error) => {
        composerModulePromise = null
        console.error('[GO][game composer] boot failed', error)
        return null
      })
  }

  return await composerModulePromise
}

export async function syncGameComposerRunning(stage = {}, context = {}) {
  const registry = Array.isArray(stage?.registry) && stage.registry.length > 0
    ? stage.registry
    : null

  if (!registry) {
    const module = composerModulePromise
      ? await composerModulePromise
      : null
    await module?.destroyComposerRunning?.()
    return
  }

  const module = await getComposerModule()
  await module?.syncComposerRunning?.({
    ...stage,
    registry,
  }, context)
}

export async function destroyGameComposerRunning() {
  const module = composerModulePromise
    ? await composerModulePromise
    : null
  await module?.destroyComposerRunning?.()
}
