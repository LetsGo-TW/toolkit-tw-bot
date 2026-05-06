import { getGameData } from "@toolkit-tw-bot/document";

function calculateNumberOfFarmsPerModel(units = [], models = [], configData) {
  const gameData = getGameData()
  const spyIndex = gameData.units.findIndex(unit => unit === 'spy')
  if (!units.length || !models || !models.length || !configData) return [0, 0, 0]
  const modelA = models.find(m => m.name=== 'A')
  const modelB = models.find(m => m.name=== 'B')
  const modelC = models.find(m => m.name=== 'C')

  const { config, buttons, popUnits: pop } = configData
  const A = Math.min(...modelA.units.reduce((max, unit, i) => {
    if (Number(unit) > 0) {
      max.push(Math.round((Number(units[i]) / Number(unit)) * 100) / 100)
    }

    return max
  }, []))
  const B = Math.min(...modelB.units.reduce((max, unit, i) => {
    if (Number(unit) > 0) {
      max.push(Math.round((Number(units[i]) / Number(unit)) * 100) / 100)
    }

    return max
  }, []))
  const unitSpy = units[spyIndex]
  const C = units.reduce((boll, unit, i) => {
    if (unit && modelC.units[i] && unit * pop[i] >= 40 && unitSpy > 0) boll = 1
    return boll
  }, 0)

  const result = buttons.map(button => config[button].active ? ( button === 'a' ? A : button === 'b' ? B : C ) : 0)
  console.debug('Clicks PER MODELs: ', result, configData)
  return result
}

export { calculateNumberOfFarmsPerModel }
