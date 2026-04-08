import { nDateTime } from "./date-parse"

// --- retorna data do servidor - pagina
const dateServer = () => !document.querySelector("#serverDate")
  ? 0
  : document.querySelector("#serverDate").textContent

// --- retorna hora do servidor - página
const timeServer = () => !document.querySelector("#serverTime")
  ? 0
  : document.querySelector("#serverTime").textContent

// --- retorna numero da data e hora de agora do jogo
const dateTimeNow = () => (dateServer() && timeServer())
  ? nDateTime(dateServer(), timeServer())
  : 0

// --- retorna diferença em segundos entre a data e hora do servidor e do sistema
const timeZone = () => !dateTimeNow()
  ? 0
  : (
    Math.round(
      (
        (
          (

            dateTimeNow() / 1000
          ) - (
            Date.now() / 1000
          )
        )
      ) / 3600
    )
  ) * 3600


const delayMillis = () => !dateTimeNow()
  ? 0
  : parseInt(
    (
      dateTimeNow() / 1000
    ) - (
      Date.now() / 1000
    )
  ) * 1000

export { dateServer, timeServer, dateTimeNow, timeZone, delayMillis }
