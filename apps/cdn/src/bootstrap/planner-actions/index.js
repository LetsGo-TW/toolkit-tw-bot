import {
  bootPlannerActionBotViewRunning,
  destroyPlannerActionBotViewRunning,
} from '../../components/go-buttons/mountPlannerActionButtons'

export async function syncPlannerActionsRunning() {
  bootPlannerActionBotViewRunning()
}

export async function destroyPlannerActionsRunning() {
  destroyPlannerActionBotViewRunning?.()
}

export default {
  destroyPlannerActionsRunning,
  syncPlannerActionsRunning,
}
