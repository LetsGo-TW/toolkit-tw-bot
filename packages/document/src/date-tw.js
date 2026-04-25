const { nDateTime } = require('@toolkit-tw-bot/core')

function dateServer(doc = document) {
  return !doc.querySelector('#serverDate')
    ? 0
    : doc.querySelector('#serverDate').textContent
}

function timeServer(doc = document) {
  return !doc.querySelector('#serverTime')
    ? 0
    : doc.querySelector('#serverTime').textContent
}

function dateTimeNow(doc = document) {
  return (dateServer(doc) && timeServer(doc))
    ? nDateTime(dateServer(doc), timeServer(doc))
    : 0
}

function timeZone(doc = document) {
  return !dateTimeNow(doc)
    ? 0
    : (
      Math.round(
        (
          (
            dateTimeNow(doc) / 1000
          ) - (
            Date.now() / 1000
          )
        ) / 3600
      )
    ) * 3600
}

function delayMillis(doc = document) {
  return !dateTimeNow(doc)
    ? 0
    : parseInt(
      (
        dateTimeNow(doc) / 1000
      ) - (
        Date.now() / 1000
      ),
    ) * 1000
}

module.exports = {
  dateServer,
  timeServer,
  dateTimeNow,
  timeZone,
  delayMillis,
}
