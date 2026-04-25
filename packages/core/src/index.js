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
const random = require('./random')

module.exports = {
  Distance,
  setInputDateTime,
  nDateTime,
  nSecStrTime,
  cTimeToSeg,
  strTimeToSec,
  getParamsUrl,
  parseGameData,
  random,
}
