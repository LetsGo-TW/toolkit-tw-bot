import { getGameData, ProtectingBot } from "@toolkit-tw-bot/document";
import { getDataRequest } from "../../common/get-data-request"
import { getReportPages } from "../../common/get-pages"
import { sleep } from "../../utils/sleep"
import { getReports } from "./get-reports"
import { fetchReports } from "./request"

const reportsHandler = async (data, target, api, d, w) => {
  const gameData = getGameData()
  console.debug(data, target)
  const insertReports = (reports) => {
    for (const report of reports) {
      if (!data.reports.find(({ report_id }) => Number(report.report_id) === Number(report_id))) {
        data.reports.push(report)
      }
    }
  }
  const findReport = (reports) => {
    const timeMinuts = parseInt(target.arrival / 1000 - (new Date(target.arrival).getSeconds()))
    if (!reports.length) return
    return reports.find(({ target: { x, y }, report_time }) => {
      return (
          Number(x) === Number(target.x) &&
          Number(y) === Number(target.y) &&
          report_time === timeMinuts
        )
      })
  }

  let report = findReport(data.reports)
  if (report) return report.report_id

  const firstRequest = getDataRequest(
    gameData.link_base_pure,
    { village: data.village.id, screen: 'report', mode: 'attack', from: 0 }
  )

  if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
    api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
    await sleep(1000, 1111);
    throw ProtectingBot.error();
  }

  const textHtml = await fetchReports(firstRequest)
  const html = new DOMParser().parseFromString(textHtml, 'text/html')
  const { pages } = getReportPages(html)
  console.debug({ pages })
  insertReports(getReports(html))
  report = findReport(data.reports)

  if (ProtectingBot["bot-protect-all-in-game"].active(html)) {
    api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
    await sleep(1000, 1111);
    throw ProtectingBot.error();
  }

  if (report) return report.report_id

  for (const url of pages) {
    if (ProtectingBot["bot-protect-all-in-game"].active(d, w) || ProtectingBot["bot-protect-all-in-game"].active()) {
      api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
      await sleep(1000, 1111);
      throw ProtectingBot.error();
    }

    const request = getDataRequest(url)
    const textHtml = await fetchReports(request)
    const html = new DOMParser().parseFromString(textHtml, 'text/html')
    insertReports(getReports(html))
    console.debug(data.reports)
    report = findReport(data.reports)

    if (ProtectingBot["bot-protect-all-in-game"].active(html)) {
      api.footer.set(`hCaptcha identificado! Encerrando...`, "err");
      await sleep(1000, 1111);
      throw ProtectingBot.error();
    }

    if (report) break
  }

  return report?.report_id
}

export { reportsHandler }
