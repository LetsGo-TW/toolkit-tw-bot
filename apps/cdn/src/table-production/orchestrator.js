import Groups from "../groups"
import { gameData, getIsPremiumActive } from "./context"
import {
  DEFAULT_GROUP_ID,
  normalizeProductionGroupId
} from "./constants"
import {
  buildTableProductionCacheKey,
  getCachedTableProduction,
  normalizeCacheTtlMs,
  setCachedTableProduction
} from "./cache"
import { getNonPremiumProduction } from "./non-premium"
import { getPremiumProduction } from "./premium"
import {
  createTableProductionController,
  getDefaultUseWorker
} from "./worker-client"

const inFlightByDatasetKey = new Map()

const normalizeGetTableProductionArgs = (group_id = 0, options = {}) => {
  const defaultUseWorker = getDefaultUseWorker()

  if (group_id && typeof group_id === "object") {
    return {
      groupId: normalizeProductionGroupId(group_id.groupId ?? group_id.group_id ?? DEFAULT_GROUP_ID),
      useWorker: typeof group_id.useWorker === "boolean"
        ? group_id.useWorker
        : defaultUseWorker,
      baseUrl: group_id.baseUrl ?? group_id.base_url ?? null,
      seasonSeconds: group_id.seasonSeconds ?? group_id.season ?? null,
      forceRefresh: group_id.forceRefresh === true,
      ignoreTtl: group_id.ignoreTtl === true
    }
  }

  return {
    groupId: normalizeProductionGroupId(group_id),
    useWorker: typeof options?.useWorker === "boolean"
      ? options.useWorker
      : defaultUseWorker,
    baseUrl: options?.baseUrl ?? options?.base_url ?? null,
    seasonSeconds: options?.seasonSeconds ?? options?.season ?? null,
    forceRefresh: options?.forceRefresh === true,
    ignoreTtl: options?.ignoreTtl === true
  }
}

const resolveTotalVillages = async ({ premium = false, groupId = 0, groups = null }) => {
  if (!premium) {
    return Number(gameData.player.villages)
  }

  if (Number(groupId) === 0) {
    return Number(gameData.player.villages)
  }

  const groupsInstance = groups || new Groups()

  if (typeof groupsInstance.villagesInGroup !== "function") {
    throw new Error("groups.villagesInGroup is not available")
  }

  const response = await groupsInstance.villagesInGroup(groupId)
  const villages = Array.isArray(response?.villages) ? response.villages : []

  return villages.length
}

const buildInFlightDatasetKey = ({ cacheKey = "", totalVillages = 0 } = {}) => {
  const key = String(cacheKey || "").trim()
  const villages = Number(totalVillages || 0)
  return `${key}|${villages}`
}

const collectPremiumProduction = async ({
  groupId = DEFAULT_GROUP_ID,
  options = {}
} = {}) => {
  const controller = await createTableProductionController(options)

  try {
    return await getPremiumProduction({
      groupId,
      controller
    })
  } finally {
    controller.terminate()
  }
}

async function getTableProduction(group_id = 0, options = {}) {
  const normalized = normalizeGetTableProductionArgs(group_id, options)
  const groups = new Groups()
  let effectiveGroupId = 0

  try {
    const premium = getIsPremiumActive()
    effectiveGroupId = premium ? normalized.groupId : 0

    const totalVillages = await resolveTotalVillages({
      premium,
      groupId: effectiveGroupId,
      groups
    })
    const ttlMs = normalizeCacheTtlMs(normalized.seasonSeconds)

    const cacheKey = buildTableProductionCacheKey({
      premium,
      groupId: effectiveGroupId
    })

    const productionCached = await getCachedTableProduction({
      cacheKey,
      totalVillages,
      forceRefresh: normalized.forceRefresh,
      ignoreTtl: normalized.ignoreTtl
    })

    if (productionCached) return productionCached

    const inFlightKey = buildInFlightDatasetKey({ cacheKey, totalVillages })
    const inFlight = inFlightByDatasetKey.get(inFlightKey)

    if (inFlight) {
      return await inFlight
    }

    const productionPromise = (async () => {
      let production = null

      if (!production) {
        production = premium
          ? await collectPremiumProduction({
              groupId: effectiveGroupId,
              options: normalized
            })
          : await getNonPremiumProduction()
      }

      const response = Array.isArray(production) ? production : []

      await setCachedTableProduction({
        cacheKey,
        totalVillages,
        ttlMs,
        values: response
      })

      return response
    })()

    inFlightByDatasetKey.set(inFlightKey, productionPromise)

    try {
      return await productionPromise
    } finally {
      if (inFlightByDatasetKey.get(inFlightKey) === productionPromise) {
        inFlightByDatasetKey.delete(inFlightKey)
      }
    }
  } catch (error) {
    console.error({ msg: error?.message || null, script: "getTableProduction", error })
    throw error
  }
}

export {
  getTableProduction
}
