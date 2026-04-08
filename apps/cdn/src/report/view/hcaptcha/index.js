import './style.css'
import { Report } from '../../index.js'

const REPORT_TYPE = "hCaptcha"
const html = `
<div class="go-report-hcaptcha">
  <div data-go-report-hcaptcha-list></div>
</div>
`

const formatDate = (value) => {
  const ms = Number(value || 0)
  if (!Number.isFinite(ms) || ms <= 0) return "-"
  return new Date(ms).toLocaleString("pt-BR")
}

const createFromHtml = (htmlStr = "") => {
  const template = document.createElement("template")
  template.innerHTML = String(htmlStr || "").trim()
  const root = template.content.firstElementChild
  return root instanceof HTMLElement ? root : null
}

const createRow = (label = "", value = "", valueClass = "") => {
  const row = document.createElement("div")
  row.className = "go-report-hcaptcha-item-row"

  const labelEl = document.createElement("span")
  labelEl.innerHTML = String(label || "")

  const valueEl = document.createElement("strong")
  valueEl.textContent = String(value)
  if (valueClass) valueEl.classList.add(valueClass)

  row.append(labelEl, valueEl)
  return row
}

function createItem(report = {}) {
  const item = document.createElement("article")
  item.className = "go-report-hcaptcha-item"

  const header = document.createElement("header")
  header.className = "go-report-hcaptcha-item-head"

  const title = document.createElement("h4")
  title.className = "go-report-hcaptcha-item-title"
  title.textContent = "hCaptcha-Solver"

  const date = document.createElement("span")
  date.className = "go-report-hcaptcha-item-date"
  date.textContent = formatDate(report?.timestamp || report?.date)

  header.append(title, date)

  const isSuccess = report?.result === 'success';

  const body = document.createElement("div")
  body.className = "go-report-hcaptcha-item-body"
  body.append(createRow("Status", isSuccess ? "Sucesso" : "Falha", isSuccess ? "status-success" : "status-error"))
  if (report?.duration) {
    body.append(createRow("Tempo Total", `${Number(report.duration).toFixed(1)}s`))
  }
  body.append(createRow("Mensagem", report?.message || "-"))

  if (report?.atempps?.length > 0) {
    const attemptsDiv = document.createElement("div")
    attemptsDiv.style.marginTop = "6px"
    attemptsDiv.style.paddingTop = "6px"
    attemptsDiv.style.borderTop = "1px dashed #e1d2af"

    const attemptsTitle = document.createElement("div")
    attemptsTitle.textContent = "Histórico de Tentativas"
    attemptsTitle.style.fontWeight = "bold"
    attemptsTitle.style.marginBottom = "4px"
    attemptsTitle.style.fontSize = "11px"
    attemptsDiv.append(attemptsTitle)

    report.atempps.forEach((attempt, index) => {
      const attBlock = document.createElement("div")
      attBlock.style.marginLeft = "8px"
      attBlock.style.marginBottom = "6px"
      attBlock.style.display = "flex"
      attBlock.style.flexDirection = "column"
      attBlock.style.gap = "2px"

      const title = document.createElement("div")
      title.textContent = `Tentativa ${index + 1}`
      title.style.fontSize = "11px"
      title.style.color = "#888"
      attBlock.append(title)

      if (attempt.resolveButtom) {
        if (attempt.resolveButtom.commmand !== undefined) {
          const isCmd = attempt.resolveButtom.commmand;
          const ts = attempt.resolveButtom.timestamp ? ` <span style="color: #888; font-size: 10px;">(${formatDate(attempt.resolveButtom.timestamp)})</span>` : '';
          attBlock.append(createRow(`Comando (chuck)${ts}`, isCmd ? 'Sim' : 'Não'))
        }

        if (attempt.resolveButtom.type) {
          const typeStr = attempt.resolveButtom.type
          const ts = attempt.resolveButtom.timestamp ? ` <span style="color: #888; font-size: 10px;">(${formatDate(attempt.resolveButtom.timestamp)})</span>` : '';
          attBlock.append(createRow(`Ação: Botão (${typeStr})${ts}`, attempt.resolveButtom.ok ? 'Ok' : 'Falha', attempt.resolveButtom.ok ? 'status-success' : 'status-error'))

          if (attempt.resolveButtom.isTrusted !== undefined) {
            const isTr = attempt.resolveButtom.isTrusted
            attBlock.append(createRow(` ↳ Simulou humano`, isTr ? 'Sim' : 'Não', isTr ? 'status-success' : 'status-error'))
          }
        }
      }

      if (attempt.resolveCaptcha) {
        const ts = attempt.resolveCaptcha.timestamp ? ` <span style="color: #888; font-size: 10px;">(${formatDate(attempt.resolveCaptcha.timestamp)})</span>` : '';
        attBlock.append(createRow(`Ação: hCaptcha${ts}`, attempt.resolveCaptcha.ok ? 'Ok' : 'Falha', attempt.resolveCaptcha.ok ? 'status-success' : 'status-error'))
        if (attempt.resolveCaptcha.isTrusted !== undefined) {
          const isTr = attempt.resolveCaptcha.isTrusted
          attBlock.append(createRow(` ↳ Simulou humano`, isTr ? 'Sim' : 'Não', isTr ? 'status-success' : 'status-error'))
        }
      }

      if (attempt.error) {
        attBlock.append(createRow(`Erro`, attempt.error, 'status-error'))
      }

      attemptsDiv.append(attBlock)
    })

    body.append(attemptsDiv)
  }

  item.append(header, body)
  return item
}

export default async function renderHCaptchaReportView({
  mountEl,
  renderId = ""
}) {
  if (!(mountEl instanceof HTMLElement)) return

  const root = createFromHtml(html)
  if (!root) return

  const list = root.querySelector("[data-go-report-hcaptcha-list]")
  if (!list) return

  const reports = await Report.get(REPORT_TYPE) || []

  if (!reports.length) {
    const empty = document.createElement("div")
    empty.className = "go-report-hcaptcha-empty"
    empty.textContent = "Nenhum relatório do hCaptcha salvo."
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
