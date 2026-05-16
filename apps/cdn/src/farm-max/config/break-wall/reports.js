import { storageBreakWallReports } from "."

function normalizeBreakWallReports(reports = []) {
  const byTarget = new Map()

  for (const report of reports) {
    const targetKey = Number(report?.target)
    if (!Number.isFinite(targetKey)) continue

    if (byTarget.has(targetKey)) {
      byTarget.set(targetKey, { ...byTarget.get(targetKey), ...report })
      continue
    }

    byTarget.set(targetKey, report)
  }

  return Array.from(byTarget.values())
}

async function getBreakWallReports() {
  const breakWallReports = await storageBreakWallReports.get() || []
  return normalizeBreakWallReports(breakWallReports)
}

async function saveBreakWallReports(reports) {
  await storageBreakWallReports.set(normalizeBreakWallReports(reports))
  return await getBreakWallReports()
}

export { getBreakWallReports, saveBreakWallReports, normalizeBreakWallReports }
