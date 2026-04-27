const DEFAULT_GROUP_ID = 0
const DEFAULT_USE_WORKER = true
const MAX_PAGE_SIZE = 1000

const normalizeProductionGroupId = (value = DEFAULT_GROUP_ID) => {
  const groupId = Number(value)
  return Number.isFinite(groupId) ? groupId : DEFAULT_GROUP_ID
}

const buildProductionScreen = () => "overview_villages&mode=prod"

export {
  DEFAULT_GROUP_ID,
  DEFAULT_USE_WORKER,
  MAX_PAGE_SIZE,
  buildProductionScreen,
  normalizeProductionGroupId
}
