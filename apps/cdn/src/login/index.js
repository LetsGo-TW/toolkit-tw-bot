const CDN = 'LOGIN'

const login = async (extensionId) => {
  const run = async () => {
    // disparar aviso quando precisar por senha.
    const isReconnectable = !document.querySelector("#user")

    const response = await chrome.runtime.sendMessage(extensionId, {
      extensionId,
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

const preparedExtensionId = window.dataStart?.extensionId

if (preparedExtensionId) {
  delete window.dataStart

  void login(preparedExtensionId)
}

export default login
