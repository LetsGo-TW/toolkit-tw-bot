import { getTableProduction } from "../table-production"

export async function refreshPlannerProductionSnapshot({ forceRefresh = true } = {}) {
  const production = await getTableProduction({
    groupId: 0,
    useWorker: true,
    forceRefresh: forceRefresh === true
  })

  const snapshot = Array.isArray(production) ? production : []

  return snapshot
}
