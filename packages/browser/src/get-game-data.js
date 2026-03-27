const { parseGameData } = require('@toolkit-tw-bot/core')

function getHeadScriptNodes(doc) {
  if (!doc?.head?.querySelectorAll) {
    return []
  }

  return Array.from(doc.head.querySelectorAll('script'))
}

function getGameData(doc = document) {
  for (const script of getHeadScriptNodes(doc)) {
    const parsed = parseGameData(script.textContent || '')

    if (parsed) {
      return parsed
    }
  }

  return parseGameData(doc?.head?.innerHTML || '')
}

module.exports = getGameData
