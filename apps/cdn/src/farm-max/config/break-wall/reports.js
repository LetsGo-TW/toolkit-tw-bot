import { storageBreakWallReports } from "."

async function getBreakWallReports() {
  const breakWallReports = await storageBreakWallReports.get() || []
  return breakWallReports
}

async function saveBreakWallReports(reports) {
  await storageBreakWallReports.set(reports)
  return await getBreakWallReports()
}

export { getBreakWallReports, saveBreakWallReports }
