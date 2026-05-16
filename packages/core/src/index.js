const Distance = require('./distance')
const {
  setInputDateTime,
  nDateTime,
  nSecStrTime,
  cTimeToSeg,
  strTimeToSec,
} = require('./date-parse')
const getParamsUrl = require('./get-params-url')
const parseGameData = require('./parse-game-data')
const {
  DEFAULT_PREPARED_ENTRY_PATTERN,
  resolvePreparedBaseUrl,
  shouldUseExtensionAssetOrigin,
  syncPreparedBaseUrl,
} = require('./prepared-base-url')
const random = require('./random')

module.exports = {
  Distance,
  DEFAULT_PREPARED_ENTRY_PATTERN,
  setInputDateTime,
  nDateTime,
  nSecStrTime,
  cTimeToSeg,
  strTimeToSec,
  getParamsUrl,
  parseGameData,
  resolvePreparedBaseUrl,
  random,
  shouldUseExtensionAssetOrigin,
  syncPreparedBaseUrl,
}
