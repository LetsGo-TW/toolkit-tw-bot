import { normalizeDateTwString } from "../shared/normalizeDateTwString"
import { nDateTime } from "../stable-compat/date-parse"

const parseQueueTitle = (img) => img?.dataset?.title || img?.title || ""
const parseQueueSource = (img) => ((img?.getAttribute("src") || img?.src || "").split("/").pop() || "").split(".")[0] || ""
const parseTwInt = (value = "") => {
  const first = String(value || "").match(/-?[0-9][0-9.]*/)?.[0] || "0"
  const normalized = first.replaceAll(".", "")
  const parsed = Number(normalized || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseDateAndTime = (strDate = "", html = document) => {
  const hhmm = strDate.match(/[0-9]{2}[:]{1}[0-9]{2}/ig)
  const strHour = hhmm ? `${hhmm[0]}:59` : ""
  const date = normalizeDateTwString(strDate)
    || html.querySelector("#serverDate")?.textContent
    || document.querySelector("#serverDate")?.textContent
    || "01/01/1970"

  return {
    date: `${date}${strHour ? ` ${strHour}` : ""}`,
    time: nDateTime(date, strHour)
  }
}

const parseIncoming = (e, col) => Array.from(e.querySelectorAll(`td:nth-child(${col}) > span > span > a:nth-child(1) > img`))
  .reduce((incoming, img) => {
    const title = img.title || img.dataset.title || ""
    const value = title.match(/[0-9]{1,}/ig) ? Number(title.match(/[0-9]{1,}/ig)[0]) : 0

    if (img.src.indexOf("attack") !== -1) {
      incoming.attack = value
    }

    if (img.src.indexOf("support") !== -1) {
      incoming.support = value
    }

    return incoming
  }, { attack: 0, support: 0 })

const parseBuildQueue = (td) => Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
  const source = parseQueueSource(img)
  const title = parseQueueTitle(img)
  const strDate = title.split(" - ")[1] || ""
  const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document)

  queue.push([source, date, time])
  return queue
}, [])

const parseSmithQueue = (td) => Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
  const source = parseQueueSource(img).replace("unit_", "")
  const title = parseQueueTitle(img)
  const strDate = title.split(" - ")[1] || ""
  const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document)

  queue.push([source, date, time])
  return queue
}, [])

const resolveTrainBuilding = (unit = "") => {
  if (["spy", "light", "marcher", "heavy"].includes(unit)) return "stable"
  if (["spear", "sword", "axe", "archer"].includes(unit)) return "barracks"
  if (["ram", "catapult"].includes(unit)) return "garage"
  if (unit === "knight") return "statue"
  if (unit === "snob") return "snob"
  return "undefined"
}

const parseTrainQueue = (td) => Array.from(td?.querySelectorAll("img") || []).reduce((queue, img) => {
  const unit = parseQueueSource(img).replace("unit_", "")
  const title = parseQueueTitle(img)
  const parts = title.split(" - ")
  const value = Number(parts[0] || 0)
  const strDate = parts[2] || ""
  const { date, time } = parseDateAndTime(strDate, td?.ownerDocument || document)

  queue.push({
    build: resolveTrainBuilding(unit),
    unit,
    value,
    time,
    date
  })

  return queue
}, [])

const TableProduction = (html = document) => {
  return Array.from(html.querySelectorAll("#production_table > tbody > tr"))
  .reduce((arr, e) => {
    const villageSpan = e.querySelector("span.quickedit-vn")
    const villageTd = villageSpan ? villageSpan.closest("td") : null

    if (!villageSpan || !villageTd) {
      return arr
    }

    const tds = Array.from(e.querySelectorAll("td"))
    const villageTdIndex = tds.indexOf(villageTd)

    if (villageTdIndex < 0) {
      return arr
    }

    const col = villageTdIndex + 1
    const id = Number(villageSpan.dataset.id)

    const coordMatch = e.querySelector("span.quickedit-content")?.innerText.match(/[0-9]{1,3}[|]{1}[0-9]{1,3}/ig)
    const coord = coordMatch ? coordMatch[0] : "0|0"
    const [x = 0, y = 0] = coord.split("|").map(Number)

    const bonusEl = e.querySelector("span.bonus_icon")
    const bonus = bonusEl
      ? [bonusEl.className, bonusEl.dataset.title || bonusEl.title || ""]
      : []

    const incoming = parseIncoming(e, col)

    const points = parseTwInt((tds[col] || {}).innerText || 0)

    const [wood = 0, stone = 0, iron = 0] = String((tds[col + 1] || {}).innerText || "")
      .replaceAll(".", "")
      .trim()
      .split(/\s+/)
      .map(parseTwInt)

    const storage = parseTwInt((tds[col + 2] || {}).innerText || 0)
    const trader = parseTwInt(String((tds[col + 3] || {}).innerText || "").split("/")[0] || 0)

    const popValues = String((tds[col + 4] || {}).innerText || "0/0").split("/")
    const pop = parseTwInt(popValues[0] || 0)
    const pop_max = parseTwInt(popValues[1] || 0)

    const build = parseBuildQueue(tds[col + 5])
    const smith = parseSmithQueue(tds[col + 6])
    const train = parseTrainQueue(tds[col + 7])

    arr.push({
      id,
      name: e.querySelector("span.quickedit-label")?.innerText?.replaceAll("\n", "").trim() || "",
      incoming,
      coord,
      bonus,
      x,
      y,
      points,
      wood,
      stone,
      iron,
      storage,
      trader,
      pop,
      pop_max,
      build,
      smith,
      train
    })

    return arr
  }, [])
}

const TableProductionNotPremium = (html = document) => Array.from(html.querySelectorAll("#production_table > tbody > tr")).reduce((arr, e) => {
  const coord = e.querySelector("span.quickedit-content").innerText.match(/[0-9]{1,3}[|]{1}[0-9]{1,3}/ig)[0]

  const bonusEl = e.querySelector("span.bonus_icon")
  const bonus = bonusEl
    ? [bonusEl.className, bonusEl.dataset.title || bonusEl.title || ""]
    : []

  const incoming = parseIncoming(e, 1)

  arr.push({
    id: Number(e.querySelector("td:nth-child(1) > span").dataset.id),
    name: e.querySelector("span.quickedit-label").innerText.replaceAll("\n", "").trim(),
    incoming,
    coord,
    bonus,
    x: Number(coord.split("|")[0]),
    y: Number(coord.split("|")[1]),
    points: parseTwInt(e.querySelector("td:nth-child(2)").innerText),
    wood: parseTwInt(e.querySelector("td:nth-child(3)").innerText.split(" ")[0]),
    stone: parseTwInt(e.querySelector("td:nth-child(3)").innerText.split(" ")[1]),
    iron: parseTwInt(e.querySelector("td:nth-child(3)").innerText.split(" ")[2]),
    storage: parseTwInt(e.querySelector("td:nth-child(4)").innerText),
    pop: parseTwInt(e.querySelector("td:nth-child(5)").innerText.split("/")[0]),
    pop_max: parseTwInt(e.querySelector("td:nth-child(5)").innerText.split("/")[1]),
    trader: undefined,
    build: [],
    smith: [],
    train: []
  })

  return arr
}, [])

export {
  TableProduction,
  TableProductionNotPremium
}
