// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import { insertConfigCopyToClipboard } from "../clipboard/view";
import { insertNotify } from "../notify";
import { clearBotViewExecutionStatus, setBotViewExecutionStatus } from "../shared/bot-view-status";
import { SETTINGS_CONFIG_TOGGLE_EVENT } from './events';

export default async() => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('intro')) return
  if (url.searchParams.get('screen') !== 'settings') return

  const destroySettings = {
    notify: null,
    copyToClipboard: null
  }
  
  const render = async () => {
    if (document.querySelector("#go_contairner")) {
      return
    }

    setBotViewExecutionStatus('Configurando')
    destroySettings.notify = await insertNotify()
    destroySettings.copyToClipboard = insertConfigCopyToClipboard()
  }

  const destroy = () => {
    clearBotViewExecutionStatus()
    if (typeof destroySettings.notify === 'function') {
      destroySettings.notify()
      destroySettings.notify = null
    }
    if (typeof destroySettings.copyToClipboard === 'function') {
      destroySettings.copyToClipboard()
      destroySettings.copyToClipboard = null
    }
  }

  const onToggleConfig = (event) => {
    const action = String(event?.detail?.action || 'toggle').trim().toLowerCase()
    const goContainer = document.querySelector("#go_contairner")

    if (action === 'close') {
      destroy()
      return
    }

    if (goContainer) {
      if (action === 'open') {
        return
      }

      destroy()
      return
    }

    void render()
  }

  window.addEventListener(SETTINGS_CONFIG_TOGGLE_EVENT, onToggleConfig)
  
  const removeListener = () => {
    destroy()
    window.removeEventListener(SETTINGS_CONFIG_TOGGLE_EVENT, onToggleConfig)
  }

  return {
    destroy: removeListener,
  }
}
