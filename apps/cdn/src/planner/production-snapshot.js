import { getTableProduction } from "../table-production"

let plannerProductionSnapshotCurrent = []
let plannerProductionVillageByIdCurrent = new Map()

function normalizePlannerProductionSnapshot(production = null) {
  return Array.isArray(production) ? production : []
}

function updatePlannerProductionSnapshotCache(production = null) {
  const snapshot = normalizePlannerProductionSnapshot(production)
  plannerProductionSnapshotCurrent = snapshot
  plannerProductionVillageByIdCurrent = new Map(
    snapshot
      .filter((village) => Number.isFinite(Number(village?.id)))
      .map((village) => [Number(village.id), village])
  )
  return snapshot
}

export async function refreshPlannerProductionSnapshot({ forceRefresh = true } = {}) {
  const production = await getTableProduction({
    groupId: 0,
    useWorker: true,
    forceRefresh: forceRefresh === true
  })

  const snapshot = updatePlannerProductionSnapshotCache(production)

  return snapshot
}

export function getPlannerProductionSnapshot() {
  return Array.isArray(plannerProductionSnapshotCurrent)
    ? [...plannerProductionSnapshotCurrent]
    : []
}

export function getPlannerProductionVillageByIdMap() {
  return new Map(plannerProductionVillageByIdCurrent)
}
