import "./style.css"
import { Report } from "../../index"

const OFFER_REPORT_TYPE = "Offer-Catch"
const offerReportHtml = `
<section class="go-report-offer-root" data-go-report-offer-root>
  <div class="go-report-offer-list" data-go-report-offer-list></div>
</section>
`

const toNumber = (value) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const asInt = (value) => Math.trunc(toNumber(value))

const formatInt = (value) => asInt(value).toLocaleString("pt-BR")

const formatSignedInt = (value) => {
  const intValue = asInt(value)
  const sign = intValue > 0 ? "+" : ""
  return `${sign}${intValue.toLocaleString("pt-BR")}`
}

const formatDate = (value) => {
  const ms = toNumber(value)
  if (!ms || ms <= 0) return "-"
  return new Date(ms).toLocaleString("pt-BR")
}

const formatDuration = (value) => {
  const raw = toNumber(value)
  if (!raw || raw <= 0) return "n/d"

  const seconds = raw > 1000 ? Math.floor(raw / 1000) : Math.floor(raw)
  const hh = Math.floor(seconds / 3600)
  const mm = Math.floor((seconds % 3600) / 60)
  const ss = seconds % 60

  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

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
  row.className = "go-report-offer-item-row"
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

const normalizeTotals = (value = {}) => ({
  receivers: asInt(value?.receivers),
  count: asInt(value?.count),
  wood: asInt(value?.wood),
  stone: asInt(value?.stone),
  iron: asInt(value?.iron)
})

function createItem(report = {}) {
  const item = document.createElement("article")
  item.className = "go-report-offer-item"

  const header = document.createElement("header")
  header.className = "go-report-offer-item-head"

  const title = document.createElement("h4")
  title.className = "go-report-offer-item-title"
  title.textContent = OFFER_REPORT_TYPE

  const date = document.createElement("span")
  date.className = "go-report-offer-item-date"
  date.textContent = formatDate(report?.date)

  header.append(title, date)

  const success = normalizeTotals(report?.success)
  const error = normalizeTotals(report?.error)
  const villagesProcessed = asInt(report?.villages?.processed ?? report?.villages_processed ?? report?.villages)
  const villagesTotal = asInt(report?.villages?.total ?? report?.villages_total)
  const villagesText = villagesTotal > 0
    ? `${formatInt(villagesProcessed)}/${formatInt(villagesTotal)}`
    : formatInt(villagesProcessed)

  const body = document.createElement("div")
  body.className = "go-report-offer-item-body"
  body.append(createRow("Processo", formatInt(report?.process)))
  body.append(createRow("Duracao acumulada", formatDuration(report?.duration_total ?? report?.duration)))
  body.append(createRow("Vilas processadas", villagesText))
  body.append(createRow("Vilas recebidas", formatInt(success.receivers)))

  if (success.count > 0) {
    body.append(createRow("Ofertas aceitas", formatInt(success.count), "is-total"))

    if (success.wood !== 0) {
      body.append(createRow(createResourceIcon("wood"), formatSignedInt(success.wood), "is-icon"))
    }

    if (success.stone !== 0) {
      body.append(createRow(createResourceIcon("stone"), formatSignedInt(success.stone), "is-icon"))
    }

    if (success.iron !== 0) {
      body.append(createRow(createResourceIcon("iron"), formatSignedInt(success.iron), "is-icon"))
    }
  }

  if (error.count > 0) {
    body.append(createRow("Erros de aceite", formatInt(error.count), "is-total"))
  }

  item.append(header, body)
  return item
}

export async function renderOfferReportView({
  mountEl = null,
  renderId = ""
} = {}) {
  if (!(mountEl instanceof HTMLElement)) return

  const root = createFromHtml(offerReportHtml)
  if (!root) return

  const list = root.querySelector("[data-go-report-offer-list]")
  if (!list) return

  const reports = await Report.get(OFFER_REPORT_TYPE)

  if (!reports.length) {
    const empty = document.createElement("div")
    empty.className = "go-report-offer-empty"
    empty.textContent = "Nenhum relatorio do Offer-Catch salvo."
    list.append(empty)
  } else {
    reports.forEach((report) => {
      list.append(createItem(report))
    })
  }

  if (renderId && mountEl.dataset.goReportRenderId !== String(renderId)) return

  mountEl.innerHTML = ""
  mountEl.append(root)
}

export default renderOfferReportView
