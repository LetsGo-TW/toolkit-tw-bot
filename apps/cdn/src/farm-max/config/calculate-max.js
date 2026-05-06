import { storageConfigFarm, configBase } from "."

async function calcMax() {
  const configFarm = await storageConfigFarm.get() || configBase
  return Object.keys(configFarm).reduce((max, key) => {
    if (key.includes('maxDistance')) {
      max['maxDistance'] = Math.max(max['maxDistance'] || 0, configFarm[key])
    }
    if (key.includes('maxWall')) {
      max['maxWall'] = Math.max(max['maxWall'] || 0, configFarm[key])
    }
    if (key.includes('maxAttacks')) {
      max['maxAttacks'] = Math.max(max['maxAttacks'] || 0, configFarm[key])
    }
    return max
  }, {})
}

export { calcMax }
