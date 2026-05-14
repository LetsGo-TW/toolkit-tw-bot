import { getPlunderList } from "../core/plunder-list"
import { dataConfig } from "../../config/data"

async function getAvaiablesReportBreakWall(html = document) {
  const { breakWall: config } = await dataConfig()
  if (!config.active) return []
  const { plunderList } = getPlunderList(html)
  return plunderList.filter(report => {
      const wallIsPositive = Number(report.wall) > 0
      const wallIsUnknownOrPositive = report.wall == null || wallIsPositive

      return report.distance <= config.maxDistance &&
      (
        (report.type === 'green' && wallIsPositive) ||
        (config.blue && report.type === 'blue' && wallIsPositive) ||
        (config.yellow && report.type === 'yellow' && wallIsUnknownOrPositive) ||
        (config.red && report.type === 'red' && wallIsUnknownOrPositive)
      )
  })
}

export { getAvaiablesReportBreakWall }
