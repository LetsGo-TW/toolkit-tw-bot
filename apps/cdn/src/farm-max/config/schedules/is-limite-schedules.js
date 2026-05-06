import { storageConfigFarm, storageFarmSchedules } from ".."

const SECONDS_PER_MINUTE = 60;

async function isLimitSeason() {
  const { last, season } = await storageConfigFarm.get()
  const { timegenerate, values } = await storageFarmSchedules.get()
  if (!last && !timegenerate) return true
  if (values.length) return false
  const limit = (last || timegenerate) + (season * SECONDS_PER_MINUTE)
  return limit < Math.round(Date.now() / 1000)
}

async function isLimitGenerate() {
  const { season, maxVillages } = await storageConfigFarm.get()
  const { timegenerate } = await storageFarmSchedules.get()
  const limit = (season * SECONDS_PER_MINUTE) + (maxVillages * SECONDS_PER_MINUTE) + timegenerate;

  return limit < Math.round(Date.now() / 1000)
}

export { isLimitGenerate, isLimitSeason }
