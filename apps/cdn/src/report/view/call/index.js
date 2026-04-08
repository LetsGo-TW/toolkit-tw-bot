import "./style.css"
import { Report } from "../../index"

const CALL_REPORT_TYPE = "Call-Balancer"
const callReportHtml = `
<section class="go-report-call-root" data-go-report-call-root>
  <div class="go-report-call-list" data-go-report-call-list></div>
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
  row.className = "go-report-call-item-row"
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

function createItem(report = {}) {
  const item = document.createElement("article")
  item.className = "go-report-call-item"

  const header = document.createElement("header")
  header.className = "go-report-call-item-head"

  const title = document.createElement("h4")
  title.className = "go-report-call-item-title"
  title.textContent = CALL_REPORT_TYPE

  const date = document.createElement("span")
  date.className = "go-report-call-item-date"
  date.textContent = formatDate(report?.date)

  header.append(title, date)

  const receiversTotal = asInt(report?.receivers)
  const sendersTotal = asInt(report?.senders)
  const resourcesTotal = asInt(report?.resources)
  const woodTotal = asInt(report?.wood)
  const stoneTotal = asInt(report?.stone)
  const ironTotal = asInt(report?.iron)
  const durationSeconds = report?.duration ?? report?.time
  const errorTotal = Array.isArray(report?.error)
    ? asInt(report.error.length)
    : asInt(report?.error)

  const body = document.createElement("div")
  body.className = "go-report-call-item-body"
  body.append(createRow("Duracao", formatDuration(durationSeconds)))
  body.append(createRow("Vilas que receberam", receiversTotal.toLocaleString("pt-BR")))
  body.append(createRow("Vilas que enviaram", sendersTotal.toLocaleString("pt-BR")))
  body.append(createRow("Total de recursos", resourcesTotal.toLocaleString("pt-BR")))

  if (woodTotal > 0) {
    body.append(createRow(createResourceIcon("wood"), woodTotal.toLocaleString("pt-BR"), "is-icon"))
  }

  if (stoneTotal > 0) {
    body.append(createRow(createResourceIcon("stone"), stoneTotal.toLocaleString("pt-BR"), "is-icon"))
  }

  if (ironTotal > 0) {
    body.append(createRow(createResourceIcon("iron"), ironTotal.toLocaleString("pt-BR"), "is-icon"))
  }

  if (errorTotal > 0) {
    body.append(createRow("Erro", errorTotal.toLocaleString("pt-BR"), "is-total"))
  }

  item.append(header, body)
  return item
}

export async function renderCallReportView({
  mountEl = null,
  renderId = ""
} = {}) {
  if (!(mountEl instanceof HTMLElement)) return

  const root = createFromHtml(callReportHtml)
  if (!root) return

  const list = root.querySelector("[data-go-report-call-list]")
  if (!list) return

  const reports = await Report.get(CALL_REPORT_TYPE)

  if (!reports.length) {
    const empty = document.createElement("div")
    empty.className = "go-report-call-empty"
    empty.textContent = "Nenhum relatório do Call-Balancer salvo."
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

export default renderCallReportView
