const LABEL = "[GO:GroupIntent]"
const COLOR = "#2563eb"

export const debugGroupIntentSync = (event, details = null, options = {}) => {
  const payload = details && typeof details === "object"
    ? { event, ...details }
    : { event, details }

  const now = new Date().toLocaleTimeString("pt-BR")
  const prefix = `${LABEL} ${now}`
  const { throttleMs, rateKey, maxLogs, windowMs, ...rest } = options || {}
  const data = {
    ...rest,
    ...payload
  }

  console.debug(`%c${prefix}`, `color:${COLOR};font-weight:600;`, data)
}

export default debugGroupIntentSync
