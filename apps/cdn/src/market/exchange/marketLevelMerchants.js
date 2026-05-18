const MARKET_LEVEL_MERCHANTS = Object.freeze({
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  11: 11,
  12: 14,
  13: 19,
  14: 26,
  15: 35,
  16: 46,
  17: 59,
  18: 74,
  19: 91,
  20: 110,
  21: 131,
  22: 154,
  23: 179,
  24: 206,
  25: 235,
})

function getBaseMarketMerchants(level = 0) {
  const normalizedLevel = Math.floor(Number(level) || 0)
  return MARKET_LEVEL_MERCHANTS[normalizedLevel] || 0
}

export {
  MARKET_LEVEL_MERCHANTS,
  getBaseMarketMerchants,
}
