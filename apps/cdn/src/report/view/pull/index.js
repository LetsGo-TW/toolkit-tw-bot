import "./style.css"
import { Report } from "../../index"

const PULL_REPORT_TYPE = "Pull-Coins"
const villagesByIdCache = new Map()
const pullReportHtml = `
<section class="go-report-pull-root" data-go-report-pull-root>
  <div class="go-report-pull-list" data-go-report-pull-list></div>
</section>
`

const asInt = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.floor(numeric))
}

const formatDate = (value) => {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return "-"
  return new Date(ms).toLocaleString("pt-BR")
}

const formatDuration = (value) => {
  const seconds = asInt(value)
  if (!seconds) return "n/d"

  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = seconds % 60

  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

const formatNumber = (value) => asInt(value).toLocaleString("pt-BR")

const createFromHtml = (html = "") => {
  const template = document.createElement("template")
  template.innerHTML = String(html || "").trim()
  const root = template.content.firstElementChild
  return root instanceof HTMLElement ? root : null
}

const createResourceIcon = (resource = "") => {
  const icon = document.createElement("span")
  icon.className = `icon header ${String(resource || "").trim()}`
  return icon
}

const createRow = (label = "", value = "", rowClassName = "") => {
  const row = document.createElement("div")
  row.className = "go-report-pull-item-row"
  if (rowClassName) {
    row.classList.add(rowClassName)
  }
  const labelEl = document.createElement("span")
  if (label instanceof HTMLElement) {
    labelEl.append(label)
  } else {
    labelEl.textContent = String(label || "")
  }
  const valueEl = document.createElement("strong")
  valueEl.textContent = String(value)
  row.append(labelEl, valueEl)
  return row
}

const normalizeMode = (value = "") => {
  const mode = String(value || "").trim().toLowerCase()
  if (!mode) return "-"
  if (mode === "call") return "Call"
  if (mode === "send") return "Send"
  return mode
}

const getRuntimeWorld = () => {
  return String(window?.game_data?.world || "").trim()
}

const toCoordValue = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

const getVillageContinent = (x = null, y = null) => {
  const xNum = toCoordValue(x)
  const yNum = toCoordValue(y)
  if (!Number.isFinite(xNum) || !Number.isFinite(yNum)) return "-"
  return `${Math.floor(yNum / 100)}${Math.floor(xNum / 100)}`
}

const buildVillageMarketHref = (villageId = 0) => {
  const id = asInt(villageId)
  if (!id) return "#"

  const url = new URL("/game.php", window.location.origin)
  const currentUrl = new URL(window.location.href)
  const sitterId = currentUrl.searchParams.get("t")
  const groupId = currentUrl.searchParams.get("group") || window?.game_data?.group_id || window?.game_data?.groupId

  if (sitterId) url.searchParams.set("t", sitterId)
  if (groupId !== null && groupId !== undefined && String(groupId).trim() !== "") {
    url.searchParams.set("group", String(groupId).trim())
  }
  url.searchParams.set("village", String(id))
  url.searchParams.set("screen", "market")

  return url.toString()
}

const makeVillageLabel = ({
  villageId = 0,
  villageName = "",
  x = null,
  y = null
} = {}) => {
  const id = asInt(villageId)
  const name = String(villageName || "").trim() || (id ? `Vila ${id}` : "Vila")
  const xNum = toCoordValue(x)
  const yNum = toCoordValue(y)
  const coordText = Number.isFinite(xNum) && Number.isFinite(yNum) ? ` (${xNum}|${yNum})` : ""
  const continent = Number.isFinite(xNum) && Number.isFinite(yNum) ? ` K${getVillageContinent(xNum, yNum)}` : ""
  return `${name}${coordText}${continent}`
}

const aggregateSuccess = (report = {}) => {
  const success = Array.isArray(report?.success) ? report.success : []

  return success.reduce((total, item) => {
    total.senders += asInt(item?.senders)
    total.wood += asInt(item?.wood)
    total.stone += asInt(item?.stone)
    total.iron += asInt(item?.iron)
    total.total += asInt(item?.wood) + asInt(item?.stone) + asInt(item?.iron)
    return total
  }, {
    senders: 0,
    wood: 0,
    stone: 0,
    iron: 0,
    total: 0
  })
}

const collectVillageIdsFromReports = (reports = []) => {
  const ids = new Set()

  ;(Array.isArray(reports) ? reports : []).forEach((report) => {
    const success = Array.isArray(report?.success) ? report.success : []
    success.forEach((entry) => {
      const villageId = asInt(entry?.village?.id || entry?.id)
      if (villageId) ids.add(villageId)
    })
  })

  return Array.from(ids)
}

const resolveVillageNameAndCoord = (entry = {}, villagesById = new Map()) => {
  const villageId = asInt(entry?.village?.id || entry?.id)
  const cached = villagesById.get(villageId) || null

  const name = String(
    cached?.name
    || entry?.village?.name
    || ""
  ).trim()

  const x = toCoordValue(cached?.x ?? entry?.village?.x)
  const y = toCoordValue(cached?.y ?? entry?.village?.y)

  return {
    villageId,
    villageName: name,
    x,
    y
  }
}

const buildDeliveredByVillage = (report = {}, villagesById = new Map()) => {
  const success = Array.isArray(report?.success) ? report.success : []

  return success.map((entry) => {
    const village = resolveVillageNameAndCoord(entry, villagesById)
    const wood = asInt(entry?.wood)
    const stone = asInt(entry?.stone)
    const iron = asInt(entry?.iron)
    return {
      ...village,
      senders: asInt(entry?.senders),
      wood,
      stone,
      iron,
      total: wood + stone + iron
    }
  }).filter((entry) => entry.total > 0 || entry.villageId > 0)
}

const createDeliveryByVillageSection = (rows = []) => {
  const section = document.createElement("div")
  section.className = "go-report-pull-deliveries"

  const title = document.createElement("div")
  title.className = "go-report-pull-deliveries-title"
  title.textContent = "Entrega por vila"
  section.append(title)

  if (!rows.length) {
    const empty = document.createElement("div")
    empty.className = "go-report-pull-delivery-empty"
    empty.textContent = "Sem entregas por vila neste registro."
    section.append(empty)
    return section
  }

  rows.forEach((row) => {
    const line = document.createElement("div")
    line.className = "go-report-pull-delivery-row"

    const link = document.createElement("a")
    link.className = "go-report-pull-village-link"
    link.textContent = makeVillageLabel(row)
    link.href = buildVillageMarketHref(row.villageId)
    link.setAttribute("data-go-title", "Abrir mercado da vila")

    const valueWrap = document.createElement("div")
    valueWrap.className = "go-report-pull-delivery-values"

    const total = document.createElement("strong")
    total.className = "go-report-pull-delivery-total"
    total.textContent = formatNumber(row.total)

    const split = document.createElement("span")
    split.className = "go-report-pull-delivery-split"
    const wood = document.createElement("span")
    wood.className = "go-report-pull-delivery-resource"
    wood.append(createResourceIcon("wood"), document.createTextNode(formatNumber(row.wood)))

    const stone = document.createElement("span")
    stone.className = "go-report-pull-delivery-resource"
    stone.append(createResourceIcon("stone"), document.createTextNode(formatNumber(row.stone)))

    const iron = document.createElement("span")
    iron.className = "go-report-pull-delivery-resource"
    iron.append(createResourceIcon("iron"), document.createTextNode(formatNumber(row.iron)))

    split.append(wood, stone, iron)

    valueWrap.append(total, split)
    line.append(link, valueWrap)
    section.append(line)
  })

  return section
}

function createItem(report = {}, villagesById = new Map()) {
  const item = document.createElement("article")
  item.className = "go-report-pull-item"

  const header = document.createElement("header")
  header.className = "go-report-pull-item-head"

  const title = document.createElement("h4")
  title.className = "go-report-pull-item-title"
  const modeText = normalizeMode(report?.mode)
  title.textContent = modeText && modeText !== "-"
    ? `${PULL_REPORT_TYPE}:${modeText}`
    : PULL_REPORT_TYPE

  const date = document.createElement("span")
  date.className = "go-report-pull-item-date"
  date.textContent = formatDate(report?.date)

  header.append(title, date)

  const error = Array.isArray(report?.error) ? report.error : []
  const totals = aggregateSuccess(report)
  const deliveredByVillage = buildDeliveredByVillage(report, villagesById)
  const receiversTotal = deliveredByVillage.length

  const body = document.createElement("div")
  body.className = "go-report-pull-item-body"
  body.append(createRow("Duracao", formatDuration(report?.duration ?? report?.time)))
  body.append(createRow("Vilas que receberam", formatNumber(receiversTotal)))
  body.append(createRow("Vilas que enviaram", formatNumber(totals.senders)))
  body.append(createRow("Entrega total", formatNumber(totals.total)))

  if (totals.wood > 0) {
    body.append(createRow(createResourceIcon("wood"), formatNumber(totals.wood), "is-icon"))
  }

  if (totals.stone > 0) {
    body.append(createRow(createResourceIcon("stone"), formatNumber(totals.stone), "is-icon"))
  }

  if (totals.iron > 0) {
    body.append(createRow(createResourceIcon("iron"), formatNumber(totals.iron), "is-icon"))
  }

  if (error.length > 0) {
    body.append(createRow("Erro", formatNumber(error.length), "is-total"))
  }

  body.append(createDeliveryByVillageSection(deliveredByVillage))

  item.append(header, body)
  return item
}

const drawPullReports = ({
  mountEl = null,
  reports = [],
  villagesById = new Map()
} = {}) => {
  if (!(mountEl instanceof HTMLElement)) return

  const root = createFromHtml(pullReportHtml)
  if (!root) return

  const list = root.querySelector("[data-go-report-pull-list]")
  if (!list) return

  if (!reports.length) {
    const empty = document.createElement("div")
    empty.className = "go-report-pull-empty"
    empty.textContent = "Nenhum relatorio do Pull-Coins salvo."
    list.append(empty)
  } else {
    reports.forEach((report) => {
      list.append(createItem(report, villagesById))
    })
  }

  mountEl.innerHTML = ""
  mountEl.append(root)
}

const resolveVillagesById = async (villageIds = []) => {
  const ids = Array.from(new Set((Array.isArray(villageIds) ? villageIds : []).map(asInt).filter(Boolean)))
  if (!ids.length) return new Map()

  return new Map(ids.map((id) => [id, villagesByIdCache.get(id) || null]))
}

export async function renderPullReportView({
  mountEl = null,
  renderId = ""
} = {}) {
  if (!(mountEl instanceof HTMLElement)) return

  const reports = await Report.get(PULL_REPORT_TYPE)
  const villageIds = collectVillageIdsFromReports(reports)
  const currentCache = new Map(villageIds.map((id) => [id, villagesByIdCache.get(id) || null]))

  if (renderId && mountEl.dataset.goReportRenderId !== String(renderId)) return
  drawPullReports({ mountEl, reports, villagesById: currentCache })

  const unresolvedIds = villageIds.filter((id) => !villagesByIdCache.has(id))
  if (!unresolvedIds.length) return

  const resolved = await resolveVillagesById(unresolvedIds)
  if (!(mountEl instanceof HTMLElement) || !mountEl.isConnected) return
  if (renderId && mountEl.dataset.goReportRenderId !== String(renderId)) return

  const villagesById = new Map(villageIds.map((id) => [id, villagesByIdCache.get(id) || resolved.get(id) || null]))
  drawPullReports({ mountEl, reports, villagesById })
}

export default renderPullReportView
