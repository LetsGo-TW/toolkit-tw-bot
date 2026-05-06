const getGameData = require('./get-game-data')
const {
  dateServer,
  timeServer,
  dateTimeNow,
  timeZone,
  delayMillis,
} = require('./date-tw')
const {
  normalizeText,
  blockedRequestActive,
  gameUpdateActive,
  extractTwSpecialMessage,
  assertNoCaptchaInGame,
  assertNoGameUpdateOrBlockedRequest,
  normalizeDateTwString,
} = require('./tw-runtime-guards')
const {
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
} = require('./unit-runtime')
const searchPlayerImageUrl = require('./search-player-image-url')
const ProtectingBot = require('./protecting-bot')
const { bindAttributeTooltip } = require('./tooltip')

module.exports = {
  normalizeText,
  blockedRequestActive,
  gameUpdateActive,
  extractTwSpecialMessage,
  assertNoCaptchaInGame,
  assertNoGameUpdateOrBlockedRequest,
  normalizeDateTwString,
  initUnitdata,
  getUnitData,
  travelSecond,
  incomingUnitSlow,
  dateServer,
  timeServer,
  dateTimeNow,
  timeZone,
  delayMillis,
  getGameData,
  searchPlayerImageUrl,
  ProtectingBot,
  bindAttributeTooltip,
}
