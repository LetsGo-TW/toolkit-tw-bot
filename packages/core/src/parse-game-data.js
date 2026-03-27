const GAME_DATA_START_TOKEN = '{"player":{'
const GAME_DATA_END_TOKEN = ');'

function parseGameData(htmlText) {
  if (typeof htmlText !== 'string' || htmlText.length === 0) {
    return undefined
  }

  const startIndex = htmlText.indexOf(GAME_DATA_START_TOKEN)

  if (startIndex === -1) {
    return undefined
  }

  const candidateText = htmlText.slice(startIndex)
  const endIndex = candidateText.indexOf(GAME_DATA_END_TOKEN)

  if (endIndex === -1) {
    return undefined
  }

  try {
    return JSON.parse(candidateText.slice(0, endIndex))
  } catch {
    return undefined
  }
}

module.exports = parseGameData
