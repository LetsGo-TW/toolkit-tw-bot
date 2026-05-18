import { normalizeTraderSummary } from "./constants"

const toNumber = (value = 0) => Number(value || 0)

const groupVillages = (rows = [], villageIdSelector = () => 0, fieldMap = () => ({})) => {
  const villagesById = new Map()
  const items = Array.isArray(rows) ? rows : []

  items.forEach((row) => {
    const id = Number(villageIdSelector(row))

    if (!Number.isFinite(id) || id <= 0) return

    const current = villagesById.get(id)

    if (current) {
      current.wood += toNumber(row?.wood)
      current.stone += toNumber(row?.stone)
      current.iron += toNumber(row?.iron)
      current.traders += toNumber(row?.traders)
      return
    }

    villagesById.set(id, {
      id,
      wood: toNumber(row?.wood),
      stone: toNumber(row?.stone),
      iron: toNumber(row?.iron),
      traders: toNumber(row?.traders),
      time: row?.arrival || row?.time || null,
      sourceVillageId: toNumber(row?.sourceVillageId),
      sourceVillageName: row?.sourceVillageName || "",
      sourceVillageCoord: row?.sourceVillageCoord || "",
      targetVillageId: toNumber(row?.targetVillageId) || id,
      targetVillageName: row?.targetVillageName || "",
      targetVillageCoord: row?.targetVillageCoord || "",
      direction: row?.direction || "",
      ...fieldMap(row, id)
    })
  })

  return Array.from(villagesById.values())
}

const resumeReceivedVillages = (rows = []) => groupVillages(
  rows,
  (row) => row?.targetVillageId ?? row?.id,
  (row, id) => ({
    id,
    targetVillageId: toNumber(row?.targetVillageId) || id,
    direction: row?.direction || "incoming"
  })
)

const resumeSentVillages = (rows = []) => groupVillages(
  rows,
  (row) => row?.sourceVillageId ?? row?.id,
  (row, id) => ({
    id,
    sourceVillageId: toNumber(row?.sourceVillageId) || id,
    direction: row?.direction || "outgoing"
  })
)

const resumeTableTrader = (rows = []) => resumeReceivedVillages(rows)

const applyTableTraderSummary = (rows = [], summary = "receivedVillages") => {
  const normalizedSummary = normalizeTraderSummary(summary)

  switch (normalizedSummary) {
    case "rows":
      return Array.isArray(rows) ? rows : []
    case "receivedVillages":
      return resumeReceivedVillages(rows)
    case "sentVillages":
      return resumeSentVillages(rows)
    default:
      throw new Error(`Unknown table trader summary: ${normalizedSummary}`)
  }
}

export {
  applyTableTraderSummary,
  resumeReceivedVillages,
  resumeSentVillages,
  resumeTableTrader
}
