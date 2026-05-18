import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document"
import { bringData } from "../../bringData"
import { getTableProduction } from "../../table-production"
import { getTableTrader } from "../../table-trader"
import { configDefault, getConfig } from "./config"
import { extractKo } from "./extractKo"
import { resolveSingleVillageFallbackUniverse } from "./singleVillageFallback"

const RESOURCE_KEYS = ["wood", "stone", "iron"]

const EXCHANGE_REQUIREMENT_DECISIONS = Object.freeze({
  DISABLED: "disabled",
  BLOCKED: "blocked",
  OBSERVE_ONLY: "observe-only",
  PROBE_READY: "probe-ready",
  CANDIDATE_READY: "candidate-ready",
  EXECUTE_READY: "execute-ready",
})

const EXCHANGE_PROBE_STATES = Object.freeze({
  UNKNOWN: "unknown",
  ENABLED: "enabled",
  DISABLED: "disabled",
})

const EXCHANGE_VIEW_REQUIREMENT_STATES = Object.freeze({
  AVAILABLE: "available",
  MISSING_PREMIUM: "missing-premium",
  WORLD_UNSUPPORTED: "world-unsupported",
  WORLD_UNKNOWN: "world-unknown",
})

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function toNumber(value, fallback = 0) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

function toNullableNumber(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
}

function toBoolean(value, fallback = false) {
  return typeof value === "boolean"
    ? value
    : fallback
}

function toStringSafe(value, fallback = "") {
  return typeof value === "string"
    ? value
    : fallback
}

function clamp01(value, fallback = 0) {
  const normalized = toNumber(value, fallback)
  if (normalized <= 0) return 0
  if (normalized >= 1) return 1
  return normalized
}

function normalizeGroupId(value = 0) {
  const normalized = Math.floor(toNumber(value, 0))
  return normalized >= 0 ? normalized : 0
}

function normalizeMarketType(value = "trade") {
  if (value === "sprinter" || value === "premium") return value
  return "trade"
}

function normalizeProbeState(value = EXCHANGE_PROBE_STATES.UNKNOWN) {
  if (value === EXCHANGE_PROBE_STATES.ENABLED) return value
  if (value === EXCHANGE_PROBE_STATES.DISABLED) return value
  return EXCHANGE_PROBE_STATES.UNKNOWN
}

function safeGetGameData() {
  try {
    return getGameData()
  } catch {
    return null
  }
}

function getTotalVillages(gameData = null) {
  const totalVillages = Math.floor(toNumber(gameData?.player?.villages, 0))
  return totalVillages > 0 ? totalVillages : 0
}

function isExchangePremiumRequired(gameData = null) {
  return getTotalVillages(gameData) > 1
}

function mergePlainObject(base = {}, override = {}) {
  const next = Array.isArray(base)
    ? [...base]
    : { ...base }

  if (!override || typeof override !== "object" || Array.isArray(override)) {
    return next
  }

  Object.keys(override).forEach((key) => {
    const baseValue = base?.[key]
    const overrideValue = override[key]

    if (
      baseValue
      && typeof baseValue === "object"
      && !Array.isArray(baseValue)
      && overrideValue
      && typeof overrideValue === "object"
      && !Array.isArray(overrideValue)
    ) {
      next[key] = mergePlainObject(baseValue, overrideValue)
      return
    }

    if (typeof overrideValue !== "undefined") {
      next[key] = overrideValue
    }
  })

  return next
}

function normalizeExchangeConfig(value = null) {
  const merged = mergePlainObject(cloneJson(configDefault), value || {})

  return {
    active: toBoolean(merged?.active, false),
    groupId: normalizeGroupId(merged?.groupId ?? 0),
    marketType: normalizeMarketType(merged?.marketType),
    buy: {
      active: toBoolean(merged?.buy?.active, false),
      maxPerBuy: Math.max(0, toNumber(merged?.buy?.maxPerBuy, 0)),
      storageLimit: clamp01(merged?.buy?.storageLimit, 0),
      limitPremium: Math.max(0, toNumber(merged?.buy?.limitPremium, 0)),
      dailyPpLimit: Math.max(0, toNumber(merged?.buy?.dailyPpLimit, 0)),
      manualRate: {
        active: toBoolean(merged?.buy?.manualRate?.active, false),
        baseRate: {
          wood: Math.max(0, toNumber(merged?.buy?.manualRate?.baseRate?.wood, 0)),
          stone: Math.max(0, toNumber(merged?.buy?.manualRate?.baseRate?.stone, 0)),
          iron: Math.max(0, toNumber(merged?.buy?.manualRate?.baseRate?.iron, 0)),
        },
      },
    },
    sell: {
      active: toBoolean(merged?.sell?.active, false),
      minStorageReserve: clamp01(merged?.sell?.minStorageReserve, 0),
      maxPerSell: Math.max(0, toNumber(merged?.sell?.maxPerSell, 0)),
      maxTransportOnly: toBoolean(merged?.sell?.maxTransportOnly, false),
      proportionalMerchants: toBoolean(merged?.sell?.proportionalMerchants, false),
      manualRate: {
        active: toBoolean(merged?.sell?.manualRate?.active, false),
        baseRate: {
          wood: Math.max(0, toNumber(merged?.sell?.manualRate?.baseRate?.wood, 0)),
          stone: Math.max(0, toNumber(merged?.sell?.manualRate?.baseRate?.stone, 0)),
          iron: Math.max(0, toNumber(merged?.sell?.manualRate?.baseRate?.iron, 0)),
        },
      },
    },
  }
}

function normalizeBestCandidate(bestCandidate = null) {
  if (!bestCandidate || typeof bestCandidate !== "object") {
    return null
  }

  const normalizedType = bestCandidate.type === "buy" || bestCandidate.type === "sell"
    ? bestCandidate.type
    : null
  const normalizedResource = RESOURCE_KEYS.includes(bestCandidate.resource)
    ? bestCandidate.resource
    : null

  if (!normalizedType || !normalizedResource) {
    return null
  }

  return {
    k: toStringSafe(bestCandidate.k, "") || null,
    probeVillageId: toNullableNumber(bestCandidate.probeVillageId),
    executionVillageId: toNullableNumber(bestCandidate.executionVillageId),
    type: normalizedType,
    resource: normalizedResource,
    score: toNumber(bestCandidate.score, 0),
  }
}

function createIssue({
  code,
  level = "error",
  scope = "runtime",
  retryable = false,
  message = "",
  meta = null,
} = {}) {
  return {
    code,
    level,
    scope,
    retryable,
    message,
    ...(meta && typeof meta === "object" ? { meta } : {}),
  }
}

function resolveWorldEnabled({
  premiumExchangeByConfig = null,
  premiumExchangeByProbe = EXCHANGE_PROBE_STATES.UNKNOWN,
} = {}) {
  if (premiumExchangeByConfig === false) return false
  if (premiumExchangeByProbe === EXCHANGE_PROBE_STATES.DISABLED) return false
  if (premiumExchangeByConfig === true) return true
  if (premiumExchangeByProbe === EXCHANGE_PROBE_STATES.ENABLED) return true
  return null
}

async function readWorldPremiumConfig() {
  try {
    const response = await bringData("tw-apis", { config: ["premium"] }, {
      resolveOnPartial: true,
    })
    const premium = response?.config?.premium

    return {
      premiumExchangeByConfig: premium?.PremiumExchange === 1
        ? true
        : premium?.PremiumExchange === 0
          ? false
          : null,
      merchantExchangeByConfig: premium?.MerchantExchange === 1
        ? true
        : premium?.MerchantExchange === 0
          ? false
          : null,
      rawPremiumConfig: premium && typeof premium === "object"
        ? premium
        : null,
    }
  } catch (error) {
    return {
      premiumExchangeByConfig: null,
      merchantExchangeByConfig: null,
      rawPremiumConfig: null,
      error,
    }
  }
}

async function resolveExchangeViewRequirements({
  config = null,
  world = null,
} = {}) {
  const gameData = safeGetGameData()
  const resolvedConfig = normalizeExchangeConfig(config || await getConfig().catch(() => null))
  const worldInput = world && typeof world === "object"
    ? world
    : await readWorldPremiumConfig()
  const worldState = {
    premiumExchangeByConfig: typeof worldInput?.premiumExchangeByConfig === "boolean"
      ? worldInput.premiumExchangeByConfig
      : null,
    merchantExchangeByConfig: typeof worldInput?.merchantExchangeByConfig === "boolean"
      ? worldInput.merchantExchangeByConfig
      : null,
    premiumExchangeByProbe: normalizeProbeState(worldInput?.premiumExchangeByProbe),
  }
  const worldEnabled = resolveWorldEnabled(worldState)
  const premiumActive = Boolean(gameData?.features?.Premium?.active)
  const totalVillages = getTotalVillages(gameData)
  const premiumRequired = isExchangePremiumRequired(gameData)

  if (worldEnabled === false) {
    return {
      ok: false,
      state: EXCHANGE_VIEW_REQUIREMENT_STATES.WORLD_UNSUPPORTED,
      disabled: true,
      statusLabel: "Inexistente",
      statusTone: "disabled",
      statusTooltip: "Este mundo não possui Mercado Premium.",
      config: resolvedConfig,
      account: {
        premiumActive,
        totalVillages,
        premiumRequired,
      },
      world: worldState,
      message: "Este mundo não possui Mercado Premium.",
      showPremiumActivation: false,
    }
  }

  if (!premiumActive && premiumRequired) {
    return {
      ok: false,
      state: EXCHANGE_VIEW_REQUIREMENT_STATES.MISSING_PREMIUM,
      disabled: false,
      statusLabel: "Sem requerimentos",
      statusTone: "danger",
      statusTooltip: "Requer Conta Premium ativa para operar com 2 ou mais vilas.",
      config: resolvedConfig,
      account: {
        premiumActive,
        totalVillages,
        premiumRequired,
      },
      world: worldState,
      message: "Requer Conta Premium ativa para usar o Exchange com 2 ou mais vilas.",
      showPremiumActivation: true,
    }
  }

  if (worldEnabled === null) {
    return {
      ok: true,
      state: EXCHANGE_VIEW_REQUIREMENT_STATES.WORLD_UNKNOWN,
      disabled: false,
      statusLabel: "Verificando",
      statusTone: "warn",
      statusTooltip: "Ainda não foi possível confirmar o Mercado Premium deste mundo.",
      config: resolvedConfig,
      account: {
        premiumActive,
        totalVillages,
        premiumRequired,
      },
      world: worldState,
      message: "Ainda não foi possível confirmar o Mercado Premium deste mundo.",
      showPremiumActivation: false,
    }
  }

  return {
    ok: true,
    state: EXCHANGE_VIEW_REQUIREMENT_STATES.AVAILABLE,
    disabled: false,
    statusLabel: resolvedConfig.active ? "Ativo" : "Desligado",
    statusTone: resolvedConfig.active ? "active" : "danger",
    statusTooltip: "",
    config: resolvedConfig,
    account: {
      premiumActive,
      totalVillages,
      premiumRequired,
    },
    world: worldState,
    message: "",
    showPremiumActivation: false,
  }
}

function buildVillageStates({
  production = [],
  trader = [],
  config,
  gameData = null,
  playerPp = 0,
} = {}) {
  const currentVillageId = toNumber(gameData?.village?.id, 0)
  const currentVillageMarketLevel = toNumber(gameData?.village?.buildings?.market, 0)
  const traderByVillageId = new Map(
    (Array.isArray(trader) ? trader : []).map((entry) => [toNumber(entry?.id, 0), entry]),
  )

  return (Array.isArray(production) ? production : []).map((village) => {
    const id = toNumber(village?.id, 0)
    const incomingVillage = traderByVillageId.get(id) || null
    const coord = toStringSafe(village?.coord, "")
    const storage = Math.max(0, toNumber(village?.storage, 0))
    const traderFree = Math.max(0, toNumber(village?.trader, 0))
    const traderAll = Math.max(0, toNumber(village?.traderAll, 0))
    const merchantAvailabilityKnown = typeof village?.merchantAvailabilityKnown === "boolean"
      ? village.merchantAvailabilityKnown
      : true
    const current = {
      wood: Math.max(0, toNumber(village?.wood, 0)),
      stone: Math.max(0, toNumber(village?.stone, 0)),
      iron: Math.max(0, toNumber(village?.iron, 0)),
    }
    const incoming = {
      wood: Math.max(0, toNumber(incomingVillage?.wood, 0)),
      stone: Math.max(0, toNumber(incomingVillage?.stone, 0)),
      iron: Math.max(0, toNumber(incomingVillage?.iron, 0)),
    }
    const projected = {
      wood: current.wood + incoming.wood,
      stone: current.stone + incoming.stone,
      iron: current.iron + incoming.iron,
    }
    const currentVillageHasMarket = id > 0
      && currentVillageId > 0
      && id === currentVillageId
      && currentVillageMarketLevel > 0
    const hasMarket = traderAll > 0 || currentVillageHasMarket
    const k = extractKo(coord)
    const maxPerSell = Math.max(0, toNumber(config?.sell?.maxPerSell, 0))
    const maxPerBuy = Math.max(0, toNumber(config?.buy?.maxPerBuy, 0))

    const sellResources = RESOURCE_KEYS.reduce((acc, resource) => {
      const reserve = storage * clamp01(config?.sell?.minStorageReserve, 0)
      const available = Math.max(0, current[resource] - reserve)
      acc[resource] = maxPerSell > 0
        ? Math.min(available, maxPerSell)
        : 0
      return acc
    }, {})

    const buyResources = RESOURCE_KEYS.reduce((acc, resource) => {
      const storageLimit = storage * clamp01(config?.buy?.storageLimit, 0)
      const availableCapacity = Math.max(0, storageLimit - projected[resource])
      acc[resource] = maxPerBuy > 0
        ? Math.min(availableCapacity, maxPerBuy)
        : 0
      return acc
    }, {})

    return {
      id,
      name: toStringSafe(village?.name, ""),
      coord,
      k,
      storage,
      trader: traderFree,
      traderAll,
      merchantAvailabilityKnown,
      hasMarket,
      playerPp: Math.max(0, toNumber(playerPp, 0)),
      current,
      incoming,
      projected,
      sellResources,
      buyResources,
    }
  })
}

function buildLaneStats({
  villages = [],
  config,
  playerPp = 0,
} = {}) {
  const buyActive = config?.buy?.active === true
  const sellActive = config?.sell?.active === true
  const ppAllowed = Math.max(0, toNumber(playerPp, 0)) > Math.max(0, toNumber(config?.buy?.limitPremium, 0))
  const ks = new Map()
  let buyLaneCount = 0
  let sellLaneCount = 0

  const touchK = (k, kind, resource, villageId) => {
    if (!k) return

    const current = ks.get(k) || {
      buy: { wood: [], stone: [], iron: [] },
      sell: { wood: [], stone: [], iron: [] },
    }

    current[kind][resource].push(villageId)
    ks.set(k, current)
  }

  ;(Array.isArray(villages) ? villages : []).forEach((village) => {
    RESOURCE_KEYS.forEach((resource) => {
      if (
        buyActive
        && village.hasMarket
        && ppAllowed
        && village.buyResources[resource] > 0
      ) {
        buyLaneCount += 1
        touchK(village.k, "buy", resource, village.id)
      }

      if (
        sellActive
        && village.hasMarket
        && village.trader > 0
        && village.sellResources[resource] > 0
      ) {
        sellLaneCount += 1
        touchK(village.k, "sell", resource, village.id)
      }
    })
  })

  const ksEligible = Array.from(ks.entries())
    .filter(([, lanes]) => RESOURCE_KEYS.some((resource) => (
      lanes.buy[resource].length > 0 || lanes.sell[resource].length > 0
    )))
    .map(([k]) => k)

  return {
    buyLaneCount,
    sellLaneCount,
    ksEligible,
  }
}

function buildBaseResponse({
  groupId = 0,
  config,
  account,
  world,
  runtime,
} = {}) {
  return {
    ok: false,
    decision: EXCHANGE_REQUIREMENT_DECISIONS.DISABLED,
    shouldNotifyController: false,
    shouldRequestPreempt: false,
    issues: [],
    capabilities: {
      canRenderView: true,
      canReadUniverse: false,
      canBuildLanes: false,
      canProbeExchange: false,
      canSelectCandidate: false,
      canExecute: false,
      canRequestPreempt: false,
    },
    summary: {
      groupId,
      buyActive: config?.buy?.active === true,
      sellActive: config?.sell?.active === true,
      villagesTotal: 0,
      villagesWithMarket: 0,
      villagesWithFreeTrader: 0,
      ksEligible: 0,
      hasBestCandidate: false,
      bestCandidateType: null,
      bestCandidateResource: null,
      probeVillageId: null,
      executionVillageId: null,
      k: null,
    },
    context: {
      account,
      world,
      runtime,
      sources: {
        productionReady: false,
        traderReady: false,
      },
    },
  }
}

function finalizeRequirements(response) {
  const hasError = response.issues.some((issue) => issue.level === "error")

  response.ok = !hasError
  response.capabilities.canRequestPreempt = response.shouldRequestPreempt === true

  if (response.decision === EXCHANGE_REQUIREMENT_DECISIONS.EXECUTE_READY) {
    response.capabilities.canExecute = true
  }

  return response
}

async function resolveExchangeRequirements({
  groupId = null,
  config = null,
  world = null,
  runtime = null,
  production = null,
  trader = null,
  bestCandidate = undefined,
  candidateResolved = false,
  useWorker = true,
  forceRefresh = false,
} = {}) {
  const gameData = safeGetGameData()
  const resolvedConfig = normalizeExchangeConfig(config || await getConfig().catch(() => null))
  const effectiveGroupId = normalizeGroupId(groupId ?? resolvedConfig.groupId ?? 0)
  const account = {
    premiumActive: Boolean(gameData?.features?.Premium?.active),
    totalVillages: getTotalVillages(gameData),
    premiumRequired: isExchangePremiumRequired(gameData),
    playerPp: toNullableNumber(gameData?.player?.pp),
  }
  const runtimeState = {
    scopeKey: toStringSafe(runtime?.scopeKey, "") || null,
    captchaActive: toBoolean(runtime?.captchaActive, ProtectingBot["bot-protect-all-in-game"].active()),
    commandActive: toBoolean(runtime?.commandActive, false),
    criticalSectionActive: toBoolean(runtime?.criticalSectionActive, false),
    runnerActive: typeof runtime?.runnerActive === "boolean"
      ? runtime.runnerActive
      : null,
  }
  const worldInput = world && typeof world === "object"
    ? world
    : await readWorldPremiumConfig()
  const worldState = {
    premiumExchangeByConfig: typeof worldInput?.premiumExchangeByConfig === "boolean"
      ? worldInput.premiumExchangeByConfig
      : null,
    merchantExchangeByConfig: typeof worldInput?.merchantExchangeByConfig === "boolean"
      ? worldInput.merchantExchangeByConfig
      : null,
    premiumExchangeByProbe: normalizeProbeState(worldInput?.premiumExchangeByProbe),
  }
  const response = buildBaseResponse({
    groupId: effectiveGroupId,
    config: resolvedConfig,
    account,
    world: worldState,
    runtime: runtimeState,
  })
  const worldEnabled = resolveWorldEnabled(worldState)
  const buyActive = resolvedConfig.buy.active === true
  const sellActive = resolvedConfig.sell.active === true
  const useSingleVillageFallback = !account.premiumActive && !account.premiumRequired

  if (!resolvedConfig.active) {
    response.issues.push(createIssue({
      code: "CONFIG_INACTIVE",
      scope: "config",
      message: "Exchange desativado na configuração.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.DISABLED
    return finalizeRequirements(response)
  }

  if (!buyActive && !sellActive) {
    response.issues.push(createIssue({
      code: "NO_ACTIVE_DIRECTION",
      scope: "config",
      message: "Nenhuma direção ativa para compra ou venda.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.DISABLED
    return finalizeRequirements(response)
  }

  if (!account.premiumActive && account.premiumRequired) {
    response.issues.push(createIssue({
      code: "ACCOUNT_NOT_PREMIUM",
      scope: "account",
      message: "Conta sem premium ativo para operar com 2 ou mais vilas.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.DISABLED
    return finalizeRequirements(response)
  }

  if (worldEnabled === false) {
    response.issues.push(createIssue({
      code: "WORLD_PREMIUM_EXCHANGE_DISABLED",
      scope: "world",
      message: "Mundo sem Premium Exchange ativo.",
      meta: {
        premiumExchangeByConfig: worldState.premiumExchangeByConfig,
        premiumExchangeByProbe: worldState.premiumExchangeByProbe,
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.DISABLED
    return finalizeRequirements(response)
  }

  if (worldEnabled === null) {
    response.issues.push(createIssue({
      code: "WORLD_PREMIUM_EXCHANGE_UNKNOWN",
      scope: "world",
      retryable: true,
      message: "Nao foi possivel confirmar Premium Exchange para o mundo.",
      meta: {
        premiumExchangeByConfig: worldState.premiumExchangeByConfig,
        premiumExchangeByProbe: worldState.premiumExchangeByProbe,
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  if (runtimeState.captchaActive) {
    response.issues.push(createIssue({
      code: "CAPTCHA_ACTIVE",
      scope: "runtime",
      retryable: true,
      message: "Captcha ou bot protection ativo.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  if (runtimeState.commandActive) {
    response.issues.push(createIssue({
      code: "COMMAND_ACTIVE",
      scope: "runtime",
      retryable: true,
      message: "Existe comando ativo bloqueando o exchange.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  if (runtimeState.criticalSectionActive) {
    response.issues.push(createIssue({
      code: "CRITICAL_SECTION_ACTIVE",
      scope: "runtime",
      retryable: true,
      message: "Existe secao critica impedindo o exchange.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  if (useSingleVillageFallback) {
    response.issues.push(createIssue({
      code: "SINGLE_VILLAGE_NON_PREMIUM_FALLBACK",
      level: "info",
      scope: "data",
      message: "Conta sem premium: usando somente a vila atual via gameData.",
    }))
  }

  const singleVillageFallbackPromise = useSingleVillageFallback
    ? resolveSingleVillageFallbackUniverse(gameData)
    : null

  const productionPromise = Array.isArray(production)
    ? Promise.resolve(production)
    : useSingleVillageFallback
      ? singleVillageFallbackPromise.then((result) => result.production)
      : getTableProduction({
          groupId: effectiveGroupId,
          useWorker,
          forceRefresh,
        })

  const traderPromise = Array.isArray(trader)
    ? Promise.resolve(trader)
    : useSingleVillageFallback
      ? singleVillageFallbackPromise.then((result) => result.trader)
      : getTableTrader({
          groupId: effectiveGroupId,
          type: "inc",
          summary: "receivedVillages",
          useWorker,
        })

  const sourceResults = await Promise.allSettled([
    productionPromise,
    traderPromise,
  ])

  const productionSource = sourceResults[0]
  const traderSource = sourceResults[1]

  if (productionSource.status !== "fulfilled") {
    response.issues.push(createIssue({
      code: "PRODUCTION_UNAVAILABLE",
      scope: "data",
      retryable: true,
      message: "Nao foi possivel ler table-production.",
      meta: {
        error: productionSource.reason?.message || String(productionSource.reason || ""),
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  if (traderSource.status !== "fulfilled") {
    response.issues.push(createIssue({
      code: "TRADER_UNAVAILABLE",
      scope: "data",
      retryable: true,
      message: "Nao foi possivel ler table-trader.",
      meta: {
        error: traderSource.reason?.message || String(traderSource.reason || ""),
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.BLOCKED
    return finalizeRequirements(response)
  }

  response.context.sources.productionReady = true
  response.context.sources.traderReady = true
  response.capabilities.canReadUniverse = true

  const villages = buildVillageStates({
    production: productionSource.value,
    trader: traderSource.value,
    config: resolvedConfig,
    gameData,
    playerPp: account.playerPp ?? 0,
  })
  const villagesWithMarket = villages.filter((village) => village.hasMarket).length
  const villagesWithFreeTrader = villages.filter((village) => village.trader > 0).length
  const villagesWithKnownMerchantAvailability = villages.filter((village) => village.merchantAvailabilityKnown).length

  response.summary.villagesTotal = villages.length
  response.summary.villagesWithMarket = villagesWithMarket
  response.summary.villagesWithFreeTrader = villagesWithFreeTrader

  if (villages.length <= 0) {
    response.issues.push(createIssue({
      code: "GROUP_EMPTY",
      level: "warn",
      scope: "data",
      retryable: true,
      message: "Nenhuma vila encontrada para o groupId informado.",
      meta: {
        groupId: effectiveGroupId,
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.OBSERVE_ONLY
    return finalizeRequirements(response)
  }

  if (villagesWithMarket <= 0) {
    response.issues.push(createIssue({
      code: "NO_MARKET_VILLAGES",
      level: "warn",
      scope: "village",
      retryable: true,
      message: "Nenhuma vila com mercado disponivel no universo atual.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.OBSERVE_ONLY
    return finalizeRequirements(response)
  }

  if (sellActive && villagesWithKnownMerchantAvailability <= 0) {
    response.issues.push(createIssue({
      code: "FREE_TRADER_UNKNOWN",
      level: "info",
      scope: "village",
      retryable: true,
      message: "Nao foi possivel confirmar mercadores livres no contexto atual.",
    }))
  }

  if (sellActive && villagesWithKnownMerchantAvailability > 0 && villagesWithFreeTrader <= 0) {
    response.issues.push(createIssue({
      code: "NO_FREE_TRADER_VILLAGES",
      level: "warn",
      scope: "village",
      retryable: true,
      message: "Nao existe vila com mercador livre para venda.",
    }))
  }

  const laneStats = buildLaneStats({
    villages,
    config: resolvedConfig,
    playerPp: account.playerPp ?? 0,
  })

  if (buyActive && laneStats.buyLaneCount <= 0) {
    response.issues.push(createIssue({
      code: "NO_BUY_LANE",
      level: "info",
      scope: "village",
      retryable: true,
      message: "Nao existem lanes de compra elegiveis no momento.",
    }))
  }

  if (sellActive && laneStats.sellLaneCount <= 0) {
    response.issues.push(createIssue({
      code: "NO_SELL_LANE",
      level: "info",
      scope: "village",
      retryable: true,
      message: "Nao existem lanes de venda elegiveis no momento.",
    }))
  }

  response.capabilities.canBuildLanes = laneStats.buyLaneCount > 0 || laneStats.sellLaneCount > 0
  response.summary.ksEligible = laneStats.ksEligible.length

  if (laneStats.ksEligible.length <= 0) {
    response.issues.push(createIssue({
      code: "NO_PROBE_K",
      level: "info",
      scope: "village",
      retryable: true,
      message: "Nenhum continente elegivel para probe no momento.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.OBSERVE_ONLY
    return finalizeRequirements(response)
  }

  response.capabilities.canProbeExchange = true
  response.capabilities.canSelectCandidate = true
  response.decision = EXCHANGE_REQUIREMENT_DECISIONS.PROBE_READY

  const normalizedBestCandidate = normalizeBestCandidate(bestCandidate)

  if (candidateResolved && !normalizedBestCandidate) {
    response.issues.push(createIssue({
      code: "NO_GLOBAL_CANDIDATE",
      level: "info",
      scope: "candidate",
      retryable: true,
      message: "Nao existe candidata global valida para executar agora.",
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.OBSERVE_ONLY
    return finalizeRequirements(response)
  }

  if (!normalizedBestCandidate) {
    return finalizeRequirements(response)
  }

  response.summary.hasBestCandidate = true
  response.summary.bestCandidateType = normalizedBestCandidate.type
  response.summary.bestCandidateResource = normalizedBestCandidate.resource
  response.summary.probeVillageId = normalizedBestCandidate.probeVillageId
  response.summary.executionVillageId = normalizedBestCandidate.executionVillageId
  response.summary.k = normalizedBestCandidate.k

  const executionVillage = villages.find((village) => village.id === normalizedBestCandidate.executionVillageId) || null

  if (!executionVillage?.hasMarket) {
    response.issues.push(createIssue({
      code: "EXECUTION_MARKET_UNCONFIRMED",
      level: "warn",
      scope: "candidate",
      retryable: true,
      message: "A vila finalista nao confirmou mercado estruturalmente.",
      meta: {
        executionVillageId: normalizedBestCandidate.executionVillageId,
      },
    }))
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.CANDIDATE_READY
    return finalizeRequirements(response)
  }

  if (runtimeState.runnerActive === true) {
    response.shouldNotifyController = true
    response.shouldRequestPreempt = true
    response.decision = EXCHANGE_REQUIREMENT_DECISIONS.CANDIDATE_READY
    return finalizeRequirements(response)
  }

  response.decision = EXCHANGE_REQUIREMENT_DECISIONS.EXECUTE_READY
  return finalizeRequirements(response)
}

function toExchangeControllerProjection(requirements = {}) {
  return {
    source: "exchange",
    scopeKey: toStringSafe(requirements?.context?.runtime?.scopeKey, "") || null,
    decision: toStringSafe(
      requirements?.decision,
      EXCHANGE_REQUIREMENT_DECISIONS.DISABLED,
    ),
    shouldRequestPreempt: requirements?.shouldRequestPreempt === true,
    issueCodes: Array.isArray(requirements?.issues)
      ? requirements.issues.map((issue) => issue?.code).filter(Boolean)
      : [],
    k: requirements?.summary?.k ?? null,
    probeVillageId: toNullableNumber(requirements?.summary?.probeVillageId),
    executionVillageId: toNullableNumber(requirements?.summary?.executionVillageId),
    candidateType: requirements?.summary?.bestCandidateType ?? null,
    candidateResource: requirements?.summary?.bestCandidateResource ?? null,
  }
}

export {
  EXCHANGE_PROBE_STATES,
  EXCHANGE_REQUIREMENT_DECISIONS,
  EXCHANGE_VIEW_REQUIREMENT_STATES,
  readWorldPremiumConfig,
  resolveExchangeViewRequirements,
  resolveExchangeRequirements,
  toExchangeControllerProjection,
}
