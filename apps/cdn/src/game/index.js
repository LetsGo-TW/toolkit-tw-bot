const CDN = 'GAME'

const game = async (extensionId) => {
  const response = await chrome.runtime.sendMessage(extensionId, {
    extensionId,
    type: CDN,
  })

  console.log(`[${CDN}]: `, response)
}

export default game
