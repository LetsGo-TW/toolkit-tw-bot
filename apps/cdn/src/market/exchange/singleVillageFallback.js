import { getBusinessInPage } from "./getBusinessInPage"
import { getBaseMarketMerchants } from "./marketLevelMerchants"
import { getMarketPageDocument } from "./requests/getMarketPage"

function toNumber(value, fallback = 0) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toStringSafe(value, fallback = "") {
  return typeof value === "string"
    ? value
    : fallback
}

async function resolveSingleVillageFallbackUniverse(gameData = null, { signal } = {}) {
  const village = gameData?.village
  const villageId = toNumber(village?.id, 0)

  if (villageId <= 0) {
    return {
      production: [],
      trader: [],
      marketDoc: null,
    }
  }

  const marketDoc = await getMarketPageDocument(gameData, { signal })
  const marketLevel = Math.max(0, toNumber(village?.buildings?.market, 0))
  const marketBonus = Math.max(1, toNumber(village?.bonus?.market, 1))
  const traderAway = Math.max(0, toNumber(village?.trader_away, 0))
  const traderAll = Math.round(getBaseMarketMerchants(marketLevel) * marketBonus)
  const traderFree = Math.max(0, traderAll - traderAway)
  const business = marketDoc
    ? getBusinessInPage(marketDoc, "entry")
    : {}

  return {
    production: [{
      id: villageId,
      name: toStringSafe(village?.name, ""),
      coord: toStringSafe(village?.coord, ""),
      bonus: [],
      x: toNumber(village?.x, 0),
      y: toNumber(village?.y, 0),
      points: Math.max(0, toNumber(village?.points, 0)),
      wood: Math.max(0, toNumber(village?.wood, 0)),
      stone: Math.max(0, toNumber(village?.stone, 0)),
      iron: Math.max(0, toNumber(village?.iron, 0)),
      storage: Math.max(0, toNumber(village?.storage_max, 0)),
      trader: traderFree,
      traderAll,
      merchantAvailabilityKnown: true,
      pop: Math.max(0, toNumber(village?.pop, 0)),
      pop_max: Math.max(0, toNumber(village?.pop_max, 0)),
      incoming: {
        attack: 0,
        support: 0,
      },
      build: [],
      smith: [],
      train: [],
    }],
    trader: [{
      id: villageId,
      wood: Math.max(0, toNumber(business?.wood, 0)),
      stone: Math.max(0, toNumber(business?.stone, 0)),
      iron: Math.max(0, toNumber(business?.iron, 0)),
    }],
    marketDoc,
  }
}

export {
  resolveSingleVillageFallbackUniverse,
}
