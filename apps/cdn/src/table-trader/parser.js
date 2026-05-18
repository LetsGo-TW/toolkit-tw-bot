import { nDateTime } from "../stable-compat/date-parse"
import { dateServer, timeServer } from "../stable-compat/date-tw"
import { normalizeDateTwString } from "../shared/normalizeDateTwString"
import { useGoTiming } from "../hooks/useGoTiming"
import { normalizeTraderType } from "./constants"

const parseResourceValue = (value = "") => {
  const match = String(value || "").replace(/\./g, "").match(/[0-9]+/)
  return match ? Number(match[0]) : 0
}

const parseVillageLink = (link) => {
  if (!link) {
    return { id: 0, name: "", coord: "" }
  }

  let id = 0

  try {
    id = Number(new URL(link.href, window.origin).searchParams.get("id")) || 0
  } catch {
    id = 0
  }

  const name = String(link.textContent || "").trim()
  const coordMatch = name.match(/[0-9]{2,3}\|[0-9]{2,3}/)

  return {
    id,
    name,
    coord: coordMatch ? coordMatch[0] : ""
  }
}

const parseTraderDirection = (row) => {
  const directionIcon = row.querySelector("td:nth-child(2) > img")
  const iconSrc = String(directionIcon?.getAttribute("src") || directionIcon?.src || "").toLowerCase()

  if (iconSrc.includes("incoming")) return "incoming"
  if (iconSrc.includes("outgoing")) return "outgoing"

  return ""
}

const pad2 = (value) => String(value).padStart(2, "0")

const formatDatePtBr = (dateObj) => {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) {
    return "01/01/1970"
  }

  return `${pad2(dateObj.getDate())}/${pad2(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`
}

const getTraderServerNowMs = () => {
  try {
    const nowMs = Number(useGoTiming?.getEffectiveServerNowMs?.())

    if (Number.isFinite(nowMs) && nowMs > 0) return nowMs
  } catch {}

  try {
    return Number(nDateTime(dateServer(), timeServer()))
  } catch {}

  return Date.now()
}

const getTraderServerDate = () => formatDatePtBr(new Date(getTraderServerNowMs()))

const addDaysToServerDate = (days = 0) => {
  const serverDate = getTraderServerDate()
  const [dd, mm, yyyy] = serverDate.split("/").map(Number)
  const dateObj = new Date(yyyy, mm - 1, dd)

  dateObj.setDate(dateObj.getDate() + Number(days || 0))

  return formatDatePtBr(dateObj)
}

const normalizeDateParts = (day, month, year) => {
  const dd = Number(day)
  const mm = Number(month)
  const yyyy = Number(year)

  if (!dd || !mm || !yyyy) return getTraderServerDate()

  return `${pad2(dd)}/${pad2(mm)}/${yyyy}`
}

const parseTraderDate = (rawDate = "") => {
  const text = String(rawDate || "").trim().toLowerCase()
  const serverDate = getTraderServerDate()

  if (!text) return serverDate

  const normalizedTwDate = normalizeDateTwString(text)

  if (normalizedTwDate) {
    return normalizedTwDate
  }

  const numericDate = text.match(/[0-9]{1,2}[.|/][0-9]{1,2}(?:[.|/][0-9]{2,4})?/)

  if (numericDate) {
    const parts = numericDate[0].split(/[.|/]/).map(Number)
    const day = parts[0] || 1
    const month = parts[1] || 1
    let year = parts[2]

    if (!year) {
      const monthNow = Number(serverDate.substring(3, 5))
      const yearNow = Number(serverDate.substring(6))
      year = month < monthNow ? yearNow + 1 : yearNow
    } else if (year < 100) {
      year = 2000 + year
    }

    return normalizeDateParts(day, month, year)
  }

  return serverDate
}

const parseTraderArrival = (rawDate = "") => {
  const date = parseTraderDate(rawDate)
  const hhmm = String(rawDate || "").match(/[0-9]{2}[:][0-9]{2}/i)
  const hour = hhmm ? `${hhmm[0]}:00` : ""

  return {
    string: `${date}${hour ? ` ${hour}` : ""}`,
    number: date ? nDateTime(date, hour) : 0
  }
}

const parseTraderResources = (row) => Array.from(
  row.querySelectorAll("td:nth-child(9) > span")
).reduce((obj, node) => {
  const textValue = parseResourceValue(node.textContent)
  const className = String(node.className || "")

  if (className.includes("wood") || node.querySelector("span.wood")) {
    obj.wood += textValue
  }
  if (className.includes("stone") || node.querySelector("span.stone")) {
    obj.stone += textValue
  }
  if (className.includes("iron") || node.querySelector("span.iron")) {
    obj.iron += textValue
  }

  return obj
}, { wood: 0, stone: 0, iron: 0 })

const parseTableTraderRow = (row) => {
  const direction = parseTraderDirection(row)

  if (!direction) return null

  const sourceVillage = parseVillageLink(row.querySelector("td:nth-child(4) > a"))
  const targetVillage = parseVillageLink(row.querySelector("td:nth-child(5) > a"))

  if (!sourceVillage.id || !targetVillage.id) return null

  const arrivalText = String(row.querySelector("td:nth-child(6)")?.textContent || "").trim()
  const traders = parseResourceValue(row.querySelector("td:nth-child(8)")?.textContent || "")
  const resources = parseTraderResources(row)

  return {
    direction,
    type: direction === "incoming" ? "inc" : direction === "outgoing" ? "out" : "",
    sourceVillageId: sourceVillage.id,
    sourceVillageName: sourceVillage.name,
    sourceVillageCoord: sourceVillage.coord,
    targetVillageId: targetVillage.id,
    targetVillageName: targetVillage.name,
    targetVillageCoord: targetVillage.coord,
    traders,
    arrival: parseTraderArrival(arrivalText),
    wood: resources.wood,
    stone: resources.stone,
    iron: resources.iron
  }
}

const parseTableTraderRows = (html = document, { type = null } = {}) => {
  const normalizedType = type ? normalizeTraderType(type) : null

  return Array.from(
    html.querySelectorAll("#trades_table tr.row_a, #trades_table tr.row_b")
  )
    .map(parseTableTraderRow)
    .filter(Boolean)
    .filter((row) => !normalizedType || row.type === normalizedType)
}

const tableTraderReceived = (html = document) => parseTableTraderRows(html, { type: "inc" }).map((row) => ({
  id: row.targetVillageId,
  time: row.arrival,
  wood: row.wood,
  stone: row.stone,
  iron: row.iron
}))

export {
  parseTableTraderRows,
  tableTraderReceived
}
