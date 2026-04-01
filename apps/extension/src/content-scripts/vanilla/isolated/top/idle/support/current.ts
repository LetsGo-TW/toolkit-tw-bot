import { getGameData } from "@toolkit-tw-bot/browser"
import { ParsedGameData } from "@toolkit-tw-bot/core"
import { GameData } from "../../../../../../types"

type CurrentGameData = ParsedGameData & GameData

function getCurrentGameData(doc: Document = document) {
  return getGameData(doc) as CurrentGameData | undefined
}

function getCurrentUrl() {
  return new URL(window.location.href, window.location.origin)
}

function isFinitePlayerId(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export { getCurrentGameData, getCurrentUrl, isFinitePlayerId, CurrentGameData }
