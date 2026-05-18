const DEFAULT_GROUP_ID = 0
const DEFAULT_TYPE = "inc"
const DEFAULT_SUMMARY = "receivedVillages"
const DEFAULT_USE_WORKER = true
const MAX_PAGE_SIZE = 1000

const normalizeTraderType = (value = DEFAULT_TYPE) => {
  const type = String(value || DEFAULT_TYPE).trim().toLowerCase()
  return type || DEFAULT_TYPE
}

const normalizeTraderSummary = (value = DEFAULT_SUMMARY) => {
  const summary = String(value || DEFAULT_SUMMARY).trim()
  return summary || DEFAULT_SUMMARY
}

const normalizeTraderGroupId = (value = DEFAULT_GROUP_ID) => {
  const groupId = Number(value)
  return Number.isFinite(groupId) ? groupId : DEFAULT_GROUP_ID
}

const buildTraderScreen = ({ type = DEFAULT_TYPE } = {}) => (
  `overview_villages&type=${normalizeTraderType(type)}&mode=trader`
)

export {
  DEFAULT_GROUP_ID,
  DEFAULT_SUMMARY,
  DEFAULT_TYPE,
  DEFAULT_USE_WORKER,
  MAX_PAGE_SIZE,
  buildTraderScreen,
  normalizeTraderGroupId,
  normalizeTraderSummary,
  normalizeTraderType
}
