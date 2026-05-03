import { DynamicBootstrap } from '../../dynamic-bootstrap'

let plannerActionsModulePromise = null

async function getPlannerActionsModule() {
  if (!plannerActionsModulePromise) {
    plannerActionsModulePromise = Promise.resolve()
      .then(async() => {
        const plannerActionsLoader = DynamicBootstrap['planner-actions']

        if (typeof plannerActionsLoader !== 'function') {
          return null
        }

        return await plannerActionsLoader()
      })
      .catch((error) => {
        plannerActionsModulePromise = null
        console.error('[GO][game planner-actions] boot failed', error)
        return null
      })
  }

  return await plannerActionsModulePromise
}

export async function syncGamePlannerActionsRunning() {
  const module = await getPlannerActionsModule()
  await module?.syncPlannerActionsRunning?.()
}

export async function destroyGamePlannerActionsRunning() {
  const module = plannerActionsModulePromise
    ? await plannerActionsModulePromise
    : null
  await module?.destroyPlannerActionsRunning?.()
}

export async function bootGamePlannerActionsRunning() {
  await syncGamePlannerActionsRunning()
}
