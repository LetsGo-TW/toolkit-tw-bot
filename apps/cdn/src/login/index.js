const CDN = 'LOGIN'

const login = async (extensionId) => {
  const response = await chrome.runtime.sendMessage(extensionId, {
    extensionId,
    type: CDN,
  })

  console.log(`[${CDN}]: `, response)
}

const preparedExtensionId = window.dataStart?.extensionId

if (preparedExtensionId) {
  delete window.dataStart

  void login(preparedExtensionId).catch((error) => {
    console.error(`[${CDN}]`, error)
  })
}

export default login
