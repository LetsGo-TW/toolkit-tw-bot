import { extensionId as RELEASE_EXTENSION_ID } from '@toolkit-tw-bot/release'

const CDN = 'LOGIN'

const login = async () => {
  const run = async () => {
    // disparar aviso quando precisar por senha.
    const isReconnectable = !document.querySelector("#user")

    const response = await chrome.runtime.sendMessage(RELEASE_EXTENSION_ID, {
      extensionId: RELEASE_EXTENSION_ID,
      type: CDN,
      isReconnectable
    })

    console.log(`[${CDN}]: `, response)

    if (!response || response.ok !== true) return;

    if (!isReconnectable) return

    /// reconnect
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }
}

void login()

export default login
