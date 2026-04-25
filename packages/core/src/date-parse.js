function setInputDateTime(cDate, cTime, cMs) {
  return `${cDate.split('/')[2]}-${cDate.split('/')[1].length == 1 ? '0' : ''}${cDate.split('/')[1]}-${cDate.split('/')[0]}T${cTime.length == 7 ? '0' : ''}${cTime}.${cMs ? cMs : '000'}`
}

function nDateTime(date, time = '00:00:00', ms) {
  const arrDate = date.split('/').map((e) => Number(e))
  const arrTime = time.split(':').map((e) => Number(e))
  const nMs = ms ? Number(ms) : arrTime.length > 3 ? arrTime[3] : 0

  if (arrTime.length === 2) {
    arrTime.unshift(0)
  }

  return Date.parse(new Date(
    arrDate[2], arrDate[1] - 1, arrDate[0], arrTime[0], arrTime[1], arrTime[2],
  )) + nMs
}

function nSecStrTime(s = 1) {
  let h = parseInt(s / 3600)
  let m = parseInt((s - (h * 3600)) / 60)
  s = parseInt(s - (h * 3600) - (m * 60))
  if (h < 10) h = h
  if (m < 10) m = '0' + m
  if (s < 10) s = '0' + s
  return `${h}:${m}:${s}`
}

function cTimeToSeg(cHora) {
  const l = cHora.length
  const nHh = Number(cHora.substring(0, l - 6))
  const nMm = Number(cHora.substring(l - 5, l - 3))
  const nSs = Number(cHora.substring(l - 2, l))
  return Number((nHh * 3600) + (nMm * 60) + nSs)
}

function strTimeToSec(string) {
  const arrTime = string.match(/[0-9]{1,}[:][0-9]{2}[:][0-9]{2}/ig)
  if (!arrTime) return null
  const time = arrTime[arrTime.length - 1].split(':')
  return (time[0] * 3600) + (time[1] * 60) + (time[2] * 1)
}

module.exports = {
  setInputDateTime,
  nDateTime,
  nSecStrTime,
  cTimeToSeg,
  strTimeToSec,
}
