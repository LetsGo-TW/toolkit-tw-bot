let bootGamePlannerActionsPromise = null

export async function bootGamePlannerActionsRunning() {
  if (!bootGamePlannerActionsPromise) {
    bootGamePlannerActionsPromise = import('../../components/go-buttons/mountPlannerActionButtons.js')
      .then((module) => {
        module?.bootPlannerActionBotViewRunning?.()
      })
      .catch((error) => {
        bootGamePlannerActionsPromise = null
        console.error('[GO][game planner-actions] boot failed', error)
      })
  }

  await bootGamePlannerActionsPromise
}
