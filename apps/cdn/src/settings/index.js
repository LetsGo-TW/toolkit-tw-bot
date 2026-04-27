// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { insertConfigCopyToClipboard } from "../clipboard/view";
import { insertNotify } from "../notify";
import { clearBotViewExecutionStatus, setBotViewExecutionStatus } from "../shared/bot-view-status";

const SETTINGS_GEAR_ICON_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/gear.green.svg`

export default async() => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('intro')) return
  if (url.searchParams.get('screen') !== 'settings') return
  if (document.querySelector('#go-slot-primary-config')) return
  const slotPrimary = document.querySelector('#go-extension-bot-view-slot-primary')
  if (!slotPrimary) return

  const destroySettings = {
    notify: null,
    copyToClipboard: null
  }

  const btnConfig = document.createElement('button')
  btnConfig.id = 'go-slot-primary-config'
  btnConfig.type = 'button'
  btnConfig.setAttribute('aria-label', 'Inserir configuraões desta página.')
  btnConfig.setAttribute('data-go-bot-view-tooltip', 'Inserir configuraões desta página.')

  const btnConfigImg = document.createElement('img')
  btnConfigImg.src = SETTINGS_GEAR_ICON_URL
  btnConfigImg.alt = ''
  btnConfigImg.width = 16
  btnConfigImg.height = 16
  btnConfig.append(btnConfigImg)
  
  const render = async () => {
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

  const btnConfigOnClick = () => {
    const goContainer = document.querySelector("#go_contairner")
    if (goContainer) {
      destroy()
      return
    }
    render()
  }

  btnConfig.addEventListener('click', btnConfigOnClick)
  
  const removeListner = () => {
    destroy()
    btnConfig.removeEventListener('click', btnConfigOnClick)
  }

  slotPrimary.insertAdjacentElement('beforeend', btnConfig)

  return {
    destroy: removeListner,
  }
}
