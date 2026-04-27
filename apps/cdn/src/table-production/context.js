import { getGameData } from "@toolkit-tw-bot/document"

const gameData = getGameData()

const getIsPremiumActive = () => Boolean(gameData?.features?.Premium?.active)

export {
  gameData,
  getIsPremiumActive
}
