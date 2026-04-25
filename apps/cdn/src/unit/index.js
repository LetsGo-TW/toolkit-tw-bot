import {
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
  getGameData,
} from '@toolkit-tw-bot/document'
import { buildUnitIndexByName } from './buildUnitIndexByName'

function getCurrentGameData() {
  if (typeof window !== 'undefined' && window?.game_data) {
    return window.game_data
  }

  if (typeof document === 'undefined') return null

  try {
    return getGameData()
  } catch (_) {
    return null
  }
}

const getWorldUnitsOrder = () => {
  const currentGameData = getCurrentGameData()
  const units = Array.isArray(currentGameData?.units) ? currentGameData.units : []
  return units.filter((unit) => unit && unit !== 'militia')
}

const getWorldUnitIndexByName = () => buildUnitIndexByName(getWorldUnitsOrder())

export {
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
  buildUnitIndexByName,
  getWorldUnitsOrder,
  getWorldUnitIndexByName,
}
