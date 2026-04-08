const setInputDateTime = ( cDate, cTime, cMs ) => `${cDate.split("/")[2]}-${cDate.split("/")[1].length == 1 ? "0" : ""}${cDate.split("/")[1]}-${cDate.split("/")[0]}T${cTime.length == 7 ? "0" : ""}${cTime}.${cMs ? cMs : "000"}`

const nDateTime = (date, time = '00:00:00', ms) => {
  const arrDate = date.split("/").map(e => Number(e))
  const arrTime = time.split(":").map(e => Number(e))
  const n_ms = ms ? Number(ms) : arrTime.length > 3 ? arrTime[3] : 0
  if (arrTime.length === 2) {
    arrTime.unshift(0)
  }
  return Date.parse(new Date(
    arrDate[2], arrDate[1] - 1, arrDate[0], arrTime[0], arrTime[1], arrTime[2]
  )) + n_ms
}

const nSecStrTime = (s = 1) => {
  let h = parseInt( s / 3600 )
  let m = parseInt( ( s - ( h * 3600 ) ) / 60 )
  s = parseInt( s - ( h * 3600 ) - ( m * 60 ) )
  if ( h < 10 ) h = h
  if ( m < 10 ) m = '0' + m
  if ( s < 10 ) s = '0' + s
  return `${h}:${m}:${s}`
}

const cTimeToSeg = ( c_hora ) => {
  let l = c_hora.length
  let n_hh = Number( c_hora.substring( 0, l - 6 ) )
  let n_mm = Number( c_hora.substring( l - 5, l - 3 ) )
  let n_ss = Number( c_hora.substring( l - 2, l ) )
  return Number(( n_hh * 3600 ) + ( n_mm * 60 ) + n_ss)
}

const strTimeToSec = string => {
  const arrTime = string.match(/[0-9]{1,}[:][0-9]{2}[:][0-9]{2}/ig)
  if (!arrTime) return null
  const time = arrTime[arrTime.length - 1].split(":")
  return (time[0] * 3600) + (time[1] * 60) + (time[2] * 1)
}

export { setInputDateTime, nDateTime, nSecStrTime, cTimeToSeg, strTimeToSec }
