let bootGameCollectorLauncherPromise = null

export async function bootGameCollectorLauncherRunning() {
  if (!bootGameCollectorLauncherPromise) {
    bootGameCollectorLauncherPromise = import('../../components/go-buttons/mountCollectorLauncherButtons.js')
      .then((module) => {
        module?.bootCollectorLauncherBotViewRunning?.()
      })
      .catch((error) => {
        bootGameCollectorLauncherPromise = null
        console.error('[GO][game collector-launcher] boot failed', error)
      })
  }

  await bootGameCollectorLauncherPromise
}
