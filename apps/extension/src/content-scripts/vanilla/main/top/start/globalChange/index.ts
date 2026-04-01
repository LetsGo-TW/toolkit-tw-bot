import changeGlobalTribalWars, { ITribalWars } from './changeGlobalTribalWars'
import { socketListen } from './socketListen'
import { reloadCurrentTabOnSessionExpired } from '../../../../shared/reloadCurrentTabOnSessionExpired'

const BOOTSTRAP_KEY = '__toolkitTwBotMainTopStartGlobalChangeBootstrap__'
const WAIT_INTERVAL_KEY = '__toolkitTwBotMainTopStartGlobalChangeWaitInterval__'
const WAIT_INTERVAL_MS = 50

type ToolkitWindow = Window & {
  [BOOTSTRAP_KEY]?: boolean
  [WAIT_INTERVAL_KEY]?: number
}

function stopWaiting(scope: ToolkitWindow) {
  if (!scope[WAIT_INTERVAL_KEY]) {
    return
  }

  window.clearInterval(scope[WAIT_INTERVAL_KEY])
  delete scope[WAIT_INTERVAL_KEY]
}

function hasTribalWarsReady() {
  return (
    'TribalWars' in window
    && typeof (window.TribalWars as ITribalWars | undefined)?.getIdleTime === 'function'
  )
}

function installWhenReady(scope: ToolkitWindow) {
  if (!hasTribalWarsReady()) {
    return false
  }

  stopWaiting(scope)
  changeGlobalTribalWars()
  return true
}

function bootstrap() {
  const scope = window as ToolkitWindow

  if (scope[BOOTSTRAP_KEY]) {
    return
  }

  scope[BOOTSTRAP_KEY] = true

  if (installWhenReady(scope)) {
    console.log('[GlobalChange] installed immediately')
    return
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void installWhenReady(scope)
    }, { once: true })
  }

  scope[WAIT_INTERVAL_KEY] = window.setInterval(() => {
    void installWhenReady(scope)
  }, WAIT_INTERVAL_MS)

  console.log('[GlobalChange] waiting for TribalWars')
}

void bootstrap()

socketListen(({ data }: { data: string }) => {
  if (!data.includes('chat/contacts')) {
    console.debug(`%c ${data}`, 'color: #70538fff')
    if (data.includes('session_expired')) {
      reloadCurrentTabOnSessionExpired()
    }
  }
})

export {}
