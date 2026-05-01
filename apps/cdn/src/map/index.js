// eslint-disable-next-line no-undef
__webpack_nonce__ = 'c29tZSBjb29sIHN0cmluZyB3aWxsIHBvcCB1cCAxMjM=';

import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'
import { searchBarbarians } from "./searchBarbarians";
import { initMapInfoCacheObserver } from "./mapInfoCacheObserver";
import { bootMapMenuRunning } from "./menu/index.js";
import { bootMapCollectorLauncherRunning, destroyMapCollectorLauncher } from "./menu/mapCollectorLauncher.js";
import { searchBarbariansView } from "./searchBarbarians/view";
import { clearBotViewExecutionStatus, setBotViewExecutionStatus } from '../shared/bot-view-status';
import { commandMap } from './commandMap';

const SETTINGS_GEAR_ICON_URL = `chrome-extension://${RELEASE_EXTENSION_ID}/icons/gear.green.svg`

export default async() => {
  const url = new URL(window.location.href)
  if (url.searchParams.get('intro')) return
  if (url.searchParams.get('screen') !== 'map') return

  const searchContext = searchBarbarians()
  initMapInfoCacheObserver()
  bootMapMenuRunning()
  bootMapCollectorLauncherRunning()

  if (document.querySelector('#go-slot-primary-config')) return
  const slotPrimary = document.querySelector('#go-extension-bot-view-slot-primary')
  if (!slotPrimary) return

  const destroyMap = { searchBarbarians: null }

  const btnConfig = document.createElement('button')
  btnConfig.id = 'go-slot-primary-config'
  btnConfig.type = 'button'
  btnConfig.setAttribute('aria-label', 'Mostrar/ocultar configuraões.')
  btnConfig.setAttribute('data-go-bot-view-tooltip', 'Mostrar/ocultar configuraões.')

  const btnConfigImg = document.createElement('img')
  btnConfigImg.src = SETTINGS_GEAR_ICON_URL
  btnConfigImg.alt = ''
  btnConfigImg.width = 16
  btnConfigImg.height = 16
  btnConfig.append(btnConfigImg)
  
  const render = async () => {
    setBotViewExecutionStatus('Configurando')
    destroyMap.searchBarbarians = searchBarbariansView(searchContext)
  }

  const destroy = () => {
    clearBotViewExecutionStatus()
    if (typeof destroyMap.searchBarbarians === 'function') {
      destroyMap.searchBarbarians()
      destroyMap.searchBarbarians = null
    }
  }

  const btnConfigOnClick = () => {
    const mounted = document.querySelector("#go__map_container")
    if (mounted) {
      destroy()
      mounted?.remove()
      return
    }
    render()
  }

  btnConfig.addEventListener('click', btnConfigOnClick)
  
  const removeListner = () => {
    destroy()
    btnConfig.removeEventListener('click', btnConfigOnClick)
    btnConfig.remove()
  }

  slotPrimary.insertAdjacentElement('beforeend', btnConfig)

  const destroyCommandMap = await commandMap();

  return {
    destroy: () => {
      removeListner()
      document.querySelector("#go__map_container")?.remove?.()
      destroyMapCollectorLauncher()
      destroyCommandMap?.()
    }
  }
}
