const BUILDING_MAX_BY_KEY = {
  main: 30,
  barracks: 25,
  stable: 20,
  garage: 15,
  church_f: 1,
  church: 3,
  watchtower: 20,
  smith: 20,
  snob: 1,
  place: 1,
  statue: 1,
  market: 25,
  wood: 30,
  stone: 30,
  iron: 30,
  farm: 30,
  storage: 30,
  hide: 10,
  wall: 20,
  university: 1,
}

const BUILDING_TRANSLATIONS_BY_MARKET = {
  en: {
    main: 'Main',
    barracks: 'Barracks',
    stable: 'Stable',
    garage: 'Garage',
    church_f: 'First church',
    church: 'Church',
    watchtower: 'Watchtower',
    smith: 'Smith',
    snob: 'Snob',
    place: 'Place',
    statue: 'Statue',
    market: 'Market',
    wood: 'Wood',
    stone: 'Stone',
    iron: 'Iron',
    farm: 'Farm',
    storage: 'Storage',
    hide: 'Hide',
    wall: 'Wall',
    university: 'University',
  },
  us: {
    main: 'Main',
    barracks: 'Barracks',
    stable: 'Stable',
    garage: 'Garage',
    church_f: 'First church',
    church: 'Church',
    watchtower: 'Watchtower',
    smith: 'Smith',
    snob: 'Snob',
    place: 'Place',
    statue: 'Statue',
    market: 'Market',
    wood: 'Wood',
    stone: 'Stone',
    iron: 'Iron',
    farm: 'Farm',
    storage: 'Storage',
    hide: 'Hide',
    wall: 'Wall',
    university: 'University',
  },
  uk: {
    main: 'Main',
    barracks: 'Barracks',
    stable: 'Stable',
    garage: 'Garage',
    church_f: 'First church',
    church: 'Church',
    watchtower: 'Watchtower',
    smith: 'Smith',
    snob: 'Snob',
    place: 'Place',
    statue: 'Statue',
    market: 'Market',
    wood: 'Wood',
    stone: 'Stone',
    iron: 'Iron',
    farm: 'Farm',
    storage: 'Storage',
    hide: 'Hide',
    wall: 'Wall',
    university: 'University',
  },
  ro: {
    main: 'Main',
    barracks: 'Barracks',
    stable: 'Stable',
    garage: 'Garage',
    church_f: 'First church',
    church: 'Church',
    watchtower: 'Watchtower',
    smith: 'Smith',
    snob: 'Snob',
    place: 'Place',
    statue: 'Statue',
    market: 'Market',
    wood: 'Wood',
    stone: 'Stone',
    iron: 'Iron',
    farm: 'Farm',
    storage: 'Storage',
    hide: 'Hide',
    wall: 'Wall',
    university: 'University',
  },
  br: {
    main: 'Edifício Principal',
    barracks: 'Quartel',
    stable: 'Estábulo',
    garage: 'Oficina',
    church_f: 'Primeira igreja',
    church: 'Igreja',
    watchtower: 'Torre de vigia',
    smith: 'Ferreiro',
    snob: 'Academia',
    place: 'Praça de reunião',
    statue: 'Estátua',
    market: 'Mercado',
    wood: 'Bosque',
    stone: 'Poço de argila',
    iron: 'Mina de ferro',
    farm: 'Fazenda',
    storage: 'Armazém',
    hide: 'Esconderijo',
    wall: 'Muralha',
    university: 'Universidade',
  },
  pt: {
    main: 'Edifício Principal',
    barracks: 'Quartel',
    stable: 'Estábulo',
    garage: 'Oficina',
    church_f: 'Primeira igreja',
    church: 'Igreja',
    watchtower: 'Torre de vigia',
    smith: 'Ferreiro',
    snob: 'Academia',
    place: 'Praça de reunião',
    statue: 'Estátua',
    market: 'Mercado',
    wood: 'Bosque',
    stone: 'Poço de argila',
    iron: 'Mina de ferro',
    farm: 'Fazenda',
    storage: 'Armazém',
    hide: 'Esconderijo',
    wall: 'Muralha',
    university: 'Universidade',
  },
  it: {
    main: 'Quartier Generale',
    barracks: 'Caserma',
    stable: 'Stalla',
    garage: 'Officina',
    church_f: 'Prima Chiesa',
    church: 'Chiesa',
    watchtower: 'Torre di Guardia',
    smith: 'Fabbro',
    snob: 'Accademia',
    place: 'Raduno',
    statue: 'Statua',
    market: 'Mercato',
    wood: 'Legno',
    stone: 'Pietra',
    iron: 'Ferro',
    farm: 'Fattoria',
    storage: 'Magazzino',
    hide: 'Nascondiglio',
    wall: 'Mura',
    university: 'Università',
  },
}

function normalizeMarket(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveTwMarket(explicitMarket = null) {
  const normalizedExplicitMarket = normalizeMarket(explicitMarket)

  if (normalizedExplicitMarket && BUILDING_TRANSLATIONS_BY_MARKET[normalizedExplicitMarket]) {
    return normalizedExplicitMarket
  }

  const gameDataMarket = typeof window !== 'undefined'
    ? normalizeMarket(window?.game_data?.market)
    : ''

  if (gameDataMarket && BUILDING_TRANSLATIONS_BY_MARKET[gameDataMarket]) {
    return gameDataMarket
  }

  const hostPrefix = typeof window !== 'undefined'
    ? String(window?.location?.hostname || '')
      .split('.')
      .filter(Boolean)[0]
      ?.match(/^[a-z]{2}/i)?.[0]
      ?.toLowerCase()
    : null

  if (hostPrefix && BUILDING_TRANSLATIONS_BY_MARKET[hostPrefix]) {
    return hostPrefix
  }

  return 'en'
}

function buildMaxBuildingsMap(explicitMarket = null) {
  const market = resolveTwMarket(explicitMarket)
  const translations = BUILDING_TRANSLATIONS_BY_MARKET[market] || BUILDING_TRANSLATIONS_BY_MARKET.en

  return Object.fromEntries(
    Object.entries(BUILDING_MAX_BY_KEY).map(([key, max]) => ([
      key,
      {
        trans: translations[key] || BUILDING_TRANSLATIONS_BY_MARKET.en[key] || key,
        max,
      },
    ])),
  )
}

function getMaxBuildings(market = null) {
  return buildMaxBuildingsMap(market)
}

const maxBuildings = buildMaxBuildingsMap()

export { getMaxBuildings, maxBuildings }
