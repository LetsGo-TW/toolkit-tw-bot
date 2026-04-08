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

const strDateTwToNumber = strDate => {
  const twServer = window?.location.host.split(".")[0].match(/^[a-z]{2}/ig)[0]
  strDate = strDate.trim().toLowerCase()
  if (strDate.indexOf(i18n[twServer].today.toLowerCase()) !== -1)
    return dateServer()
  if (strDate.indexOf(i18n[twServer].tomorrow.toLowerCase()) !== -1)
    return new Date(nDateTime(dateServer()) + (1000 * 60 * 60 * 24)).toLocaleDateString("pt-BR")
  if (strDate.indexOf(i18n[twServer].yesterday.toLowerCase()) !== -1)
    return new Date(nDateTime(dateServer()) - (1000 * 60 * 60 * 24)).toLocaleDateString("pt-BR")
  if (strDate.match(/[0-9]{1,2}[.|/][0-9]{1,2}[.|/][0-9]{0,4}/ig)) {
    const arrDate = strDate.match(/[0-9]{1,2}[.|/][0-9]{1,2}[.|/][0-9]{0,4}/ig)[0].split(/[.|/]/)
    const monthNow = new Date(nDateTime(dateServer())).getMonth()
    const yearNow = new Date(nDateTime(dateServer())).getFullYear()
    if (!arrDate[2])
      arrDate[2] = Number(arrDate[1]) < monthNow ? yearNow + 1 : yearNow
    return new Date(`${arrDate[1]}.${arrDate[0]}.${arrDate[2]}`).toLocaleDateString("pt-BR")
  }
  const ind = i18n[twServer].monthLiteral.indexOf(strDate.match(/[a-z]{3}/ig)[0])
  if (ind !== -1) {
    if (
      new Date(strDate.replace(i18n[twServer].monthLiteral[ind].toLowerCase(),
      i18n["en"].monthLiteral[ind])).toLocaleDateString("pt-BR") != "Invalid Date"
    ) {
      return new Date(
        strDate.replace(i18n[twServer].monthLiteral[ind].toLowerCase(),
        i18n["en"].monthLiteral[ind])).toLocaleDateString("pt-BR")
    } else {
      return new Date(`${String(ind + 1).length > 1
        ? String(ind + 1)
        : `0${String(ind + 1)}`}.${strDate.match(/[0-9]{1,2}/ig)[0]}.${strDate.match(/[0-9]{2,4}$/ig)[0]}`).toLocaleDateString("pt-BR")
    }
  }
}

export { strDateTwToNumber }
