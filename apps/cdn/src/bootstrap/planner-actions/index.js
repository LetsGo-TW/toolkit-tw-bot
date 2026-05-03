import {
  bootPlannerActionBotViewRunning,
  destroyPlannerActionBotViewRunning,
} from '../../components/go-buttons/mountPlannerActionButtons'

function closeActivePlannerPopup() {
  const root = document.getElementById('go-popup-map-planner')
  if (!(root instanceof HTMLElement)) return

  const closeBtn = root.querySelector('a.popup_box_close, [data-action="close"], .popup_box_close')
  if (closeBtn instanceof HTMLElement) {
    closeBtn.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }))
    return
  }

  document.dispatchEvent(new CustomEvent('go:popup:close', {
    detail: {
      popupId: 'go-popup-map-planner'
    }
  }))
  root.remove()
  document.dispatchEvent(new CustomEvent('go:planner:close', {
    detail: {
      popupId: 'go-popup-map-planner'
    }
  }))
}

export async function syncPlannerActionsRunning() {
  bootPlannerActionBotViewRunning()
}

export async function destroyPlannerActionsRunning() {
  closeActivePlannerPopup()
  destroyPlannerActionBotViewRunning?.()
}

export default {
  destroyPlannerActionsRunning,
  syncPlannerActionsRunning,
}
