import { getPlunderList } from "../core/plunder-list"
import { dataConfig } from "../../config/data"

async function getAvaiablesReportBreakWall(html = document) {
  const { breakWall: config } = await dataConfig()
  if (!config.active) return []
  const { plunderList } = getPlunderList(html)
  return plunderList.filter(report => {
      return report.distance <= config.maxDistance &&
      (
        (report.type === 'green' && report.wall && report.wall > 0) ||
        (config.blue && report.type === 'blue' && report.wall > 0) ||
        (config.yellow && report.type === 'yellow') ||
        (config.red && report.type === 'red')
      )
  })
}

export { getAvaiablesReportBreakWall }
