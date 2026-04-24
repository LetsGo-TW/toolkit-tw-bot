import { dateServer } from "../../stable-compat/date-tw"
import { nDateTime } from "../../stable-compat/date-parse"

const i18n = {
  ro: {
    monthLiteral: [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec' ],
    today : "astăzi la ora",
    tomorrow : "mâine",
    yesterday: "leri",
  },
  en: {
    monthLiteral: [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec' ],
    today : "today",
    tomorrow : "tomorrow",
    yesterday: "yesterday",
  },
  us: {
    monthLiteral: [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec' ],
    today : "today",
    tomorrow : "tomorrow",
    yesterday: "yesterday",
  },
  uk: {
    monthLiteral: [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'ago', 'sep', 'out', 'nov', 'dec' ],
    today : "today",
    tomorrow : "tomorrow",
    yesterday: "yesterday",
  },
  br: {
    monthLiteral: [ 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez' ],
    today : "hoje",
    tomorrow : "amanhã",
    yesterday: "ontem",
  },
  pt: {
    monthLiteral: [ 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez' ],
    today : "hoje",
    tomorrow : "amanhã",
    yesterday: "ontem",
  },
  it: {
    monthLiteral: [ 'gen', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'set', 'oct', 'nov', 'dec'],
    today : "oggi",
    tomorrow : "domani",
    yesterday: "leri",
  },
}

const normalizeDateTwString = (value = "") => {
  const twServer = window?.location?.host?.split(".")?.[0]?.match(/^[a-z]{2}/i)?.[0]?.toLowerCase() || null
  const locale = twServer ? i18n[twServer] : null
  const strDate = String(value || "").trim().toLowerCase()

  if (!locale || !strDate) return null

  if (strDate.indexOf(locale.today.toLowerCase()) !== -1) {
    return dateServer() || null
  }

  if (strDate.indexOf(locale.tomorrow.toLowerCase()) !== -1) {
    return new Date(nDateTime(dateServer()) + (1000 * 60 * 60 * 24)).toLocaleDateString("pt-BR")
  }

  if (strDate.indexOf(locale.yesterday.toLowerCase()) !== -1) {
    return new Date(nDateTime(dateServer()) - (1000 * 60 * 60 * 24)).toLocaleDateString("pt-BR")
  }

  const numericMatch = strDate.match(/[0-9]{1,2}[.|/][0-9]{1,2}[.|/][0-9]{0,4}/i)

  if (numericMatch) {
    const arrDate = numericMatch[0].split(/[.|/]/)
    const monthNow = new Date(nDateTime(dateServer())).getMonth()
    const yearNow = new Date(nDateTime(dateServer())).getFullYear()

    if (!arrDate[2]) {
      arrDate[2] = Number(arrDate[1]) < monthNow ? yearNow + 1 : yearNow
    }

    const normalized = new Date(`${arrDate[1]}.${arrDate[0]}.${arrDate[2]}`).toLocaleDateString("pt-BR")

    return normalized !== "Invalid Date"
      ? normalized
      : null
  }

  const monthMatch = strDate.match(/[a-z]{3}/i)
  if (!monthMatch) return null

  const ind = locale.monthLiteral.indexOf(monthMatch[0])
  if (ind === -1) return null

  const translatedDate = new Date(
    strDate.replace(locale.monthLiteral[ind].toLowerCase(), i18n.en.monthLiteral[ind])
  ).toLocaleDateString("pt-BR")

  if (translatedDate !== "Invalid Date") {
    return translatedDate
  }

  const dayMatch = strDate.match(/[0-9]{1,2}/i)
  const yearMatch = strDate.match(/[0-9]{2,4}$/i)

  if (!dayMatch || !yearMatch) return null

  return new Date(`${String(ind + 1).length > 1
    ? String(ind + 1)
    : `0${String(ind + 1)}`}.${dayMatch[0]}.${yearMatch[0]}`).toLocaleDateString("pt-BR")
}

export { normalizeDateTwString }
