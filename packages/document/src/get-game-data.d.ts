import type { ParsedGameData } from '@toolkit-tw-bot/core'

declare function getGameData(
  doc?: Document,
): ParsedGameData | undefined

export = getGameData
