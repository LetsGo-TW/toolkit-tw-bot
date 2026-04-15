
import { Report } from "../../report/index.js"
import { getCaptchaNowMs } from "../show/index.js"

const SESSION_KEY = "go-hcaptcha-current-report"

function formatReportTimestamp(value = null) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ""

  const dt = new Date(timestamp)
  if (Number.isNaN(dt.getTime())) return ""

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt)
}

function formatBinaryStatus(value) {
  if (value === true) return "✅"
  if (value === false) return "❌"
  return "⚪"
}

function formatTrustedStatus(value) {
  if (value === true) return "✅"
  if (value === false) return "❌"
  return "⚪"
}

export const ReportSession = {
  // Inicia um relatório em branco para a sessão atual
  init() {
    const data = {
      timestamp: getCaptchaNowMs(),
      duration: null,
      atempps: []
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
    return data
  },

  get() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  },

  save(data) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data))
  },

  cloneAttempt(attempt = null) {
    if (!attempt || typeof attempt !== "object") return {
      resolveButtom: null,
      resolveCaptcha: null,
      error: null
    }

    return {
      ...attempt,
      resolveButtom: attempt.resolveButtom ? { ...attempt.resolveButtom } : null,
      resolveCaptcha: attempt.resolveCaptcha ? { ...attempt.resolveCaptcha } : null,
      error: attempt.error || null
    }
  },

  snapshot(result = "", message = "") {
    const report = ReportSession.get()
    if (!report) return null

    return {
      ...report,
      result: String(result || report.result || "").trim() || null,
      message: String(message || report.message || "").trim() || null,
      duration: (getCaptchaNowMs() - Number(report.timestamp || 0)) / 1000,
      atempps: Array.isArray(report.atempps)
        ? report.atempps.map((attempt) => ReportSession.cloneAttempt(attempt))
        : []
    }
  },

  formatNotificationText(report = null) {
    if (!report) {
      return "💀 hCaptcha falhou, mas o relatório não ficou disponível."
    }

    const isSuccess = report.result === "success"
    const lines = [isSuccess ? "✅ hCaptcha resolvido" : "💀 hCaptcha não resolvido"]
    const startedAt = formatReportTimestamp(report.timestamp)
    const duration = Number(report.duration)

    if (startedAt) {
      lines.push(`🕛 Início: ${startedAt}`)
    }

    if (Number.isFinite(duration) && duration > 0) {
      lines.push(`⏱️ Duração: ${duration.toFixed(1)}s`)
    }

    if (report.message) {
      lines.push(`💬 Mensagem: ${report.message}`)
    }

    const attempts = Array.isArray(report.atempps) ? report.atempps : []

    if (!attempts.length) {
      return lines.join("\n")
    }

    lines.push("")

    attempts.forEach((attempt, index) => {
      const button = attempt?.resolveButtom
      const captcha = attempt?.resolveCaptcha
      const buttonType = String(button?.type || "").trim()
      const hasButtonLine = buttonType || button?.ok !== undefined || button?.isTrusted !== undefined
      const hasCaptchaLine = captcha?.ok !== undefined || captcha?.isTrusted !== undefined

      lines.push(`${index + 1}. Tentativa ➜ Ações:`)

      if (button?.commmand !== undefined) {
        lines.push(`➥ Comando chuck: ${formatBinaryStatus(button.commmand)}`)
      }

      if (hasButtonLine) {
        const buttonLabel = buttonType ? ` (${buttonType})` : ""
        let buttonLine = `➥ Botão${buttonLabel}: ${formatBinaryStatus(button?.ok)}`
        if (button?.isTrusted !== undefined) {
          buttonLine += ` ↳ Simulou humano: ${formatTrustedStatus(button.isTrusted)}`
        }
        lines.push(buttonLine)
      }

      if (hasCaptchaLine) {
        let captchaLine = `➥ hCaptcha: ${formatBinaryStatus(captcha?.ok)}`
        if (captcha?.isTrusted !== undefined) {
          captchaLine += ` ↳ Simulou humano: ${formatTrustedStatus(captcha.isTrusted)}`
        }
        lines.push(captchaLine)
      }

      if (attempt?.error) {
        lines.push(`➥ Erro: ${attempt.error}`)
      }

      if (index !== attempts.length - 1) {
        lines.push("")
      }
    })

    return lines.join("\n")
  },

  // Adiciona uma nova tentativa na mesma árvore da sessão
  addAttempt() {
    let report = ReportSession.get()
    if (!report) report = ReportSession.init()

    report.atempps.push({
      resolveButtom: null,
      resolveCaptcha: null,
      error: null
    })

    ReportSession.save(report)
  },

  updateError(message) {
    const report = ReportSession.get()
    if (!report || report.atempps.length === 0) return
    const lastAttempt = report.atempps[report.atempps.length - 1]
    lastAttempt.error = message
    ReportSession.save(report)
  },

  updateCommand(used) {
    const report = ReportSession.get()
    if (!report || report.atempps.length === 0) return
    const lastAttempt = report.atempps[report.atempps.length - 1]
    if (!lastAttempt.resolveButtom) lastAttempt.resolveButtom = {}
    lastAttempt.resolveButtom.commmand = used
    ReportSession.save(report)
  },

  updateButton(buttonData) {
    const report = ReportSession.get()
    if (!report || report.atempps.length === 0) return
    const lastAttempt = report.atempps[report.atempps.length - 1]
    const currentCommand = lastAttempt.resolveButtom?.commmand || false
    lastAttempt.resolveButtom = { ...buttonData, commmand: currentCommand }
    ReportSession.save(report)
  },

  // Atualizado pelo iframe assim que o captcha for resolvido/falhar
  updateCaptcha(captchaData) {
    const report = ReportSession.get()
    if (!report || report.atempps.length === 0) return

    // Atualiza sempre a última tentativa em andamento
    const lastAttempt = report.atempps[report.atempps.length - 1]
    lastAttempt.resolveCaptcha = captchaData

    ReportSession.save(report)
  },

  // Quando todo o fluxo terminar (sucesso ou limite de 3 erros), chamamos o finish
  async finish(result, message = "") {
    const report = ReportSession.get()
    if (!report) return

    report.duration = (getCaptchaNowMs() - report.timestamp) / 1000

    // Joga os dados consolidados para o orquestrador global de relatórios
    await Report.new("hCaptcha", {
      result, // "success" ou "error"
      message,
      duration: report.duration,
      timestamp: report.timestamp,
      atempps: report.atempps
    })

    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem('hCaptcha_retry')
    sessionStorage.removeItem('hCaptcha_attempts')
  },

  // Liga o "ouvido" da página pai para receber os status do iframe do Captcha
  listenMessages() {
    const onMessage = (event) => {
      const data = event.data
      if (!data || typeof data !== "object") return

      if (data.type === "GO_HCAPTCHA_UPDATE_CAPTCHA") {
        ReportSession.updateCaptcha(data.payload)
      } else if (data.type === "GO_HCAPTCHA_FINISH") {
        ReportSession.finish(data.payload.result, data.payload.message)
      }
    }

    window.addEventListener("message", onMessage)

    return () => {
      window.removeEventListener("message", onMessage)
    }
  }
}
