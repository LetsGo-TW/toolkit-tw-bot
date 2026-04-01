const getGameData = require('./get-game-data')
const searchPlayerImageUrl = require('./search-player-image-url')
const combineAbortControllerSignals = require('./combine-abort-controller-signals')
const ProtectingBot = require('./protecting-bot')
const {
  makeAjaxHeadersPost,
  makeAjaxHeadersGet,
  makeAjaxHeadersGetDoc,
  makeAjaxBody,
} = require('./make-ajax')

module.exports = {
  getGameData,
  searchPlayerImageUrl,
  combineAbortControllerSignals,
  ProtectingBot,
  makeAjaxHeadersPost,
  makeAjaxHeadersGet,
  makeAjaxHeadersGetDoc,
  makeAjaxBody,
}
