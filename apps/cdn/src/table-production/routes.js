import { gameData } from "./context"
import {
  buildProductionScreen,
  DEFAULT_GROUP_ID,
  MAX_PAGE_SIZE,
  normalizeProductionGroupId
} from "./constants"

const normalizePageNumber = (value = -1) => {
  const page = Number(value)
  return Number.isFinite(page) ? page : -1
}

const buildProductionPageUrl = ({
  groupId = DEFAULT_GROUP_ID,
  page = -1
} = {}) => {
  const normalizedGroupId = normalizeProductionGroupId(groupId)
  const normalizedPage = normalizePageNumber(page)
  const screen = buildProductionScreen()

  return new URL(
    `${gameData.link_base_pure}${screen}&group=${normalizedGroupId}&page=${normalizedPage}`,
    window.origin
  )
}

const buildChangePageSizeUrl = ({
  groupId = DEFAULT_GROUP_ID
} = {}) => {
  const normalizedGroupId = normalizeProductionGroupId(groupId)
  const screen = buildProductionScreen()

  return new URL(
    `${gameData.link_base_pure}${screen}&group=${normalizedGroupId}&action=change_page_size`,
    window.origin
  )
}

const buildChangePageSizePayload = ({ pageSize = MAX_PAGE_SIZE } = {}) => ({
  page_size: Number(pageSize || MAX_PAGE_SIZE),
  h: gameData.csrf
})

export {
  buildChangePageSizePayload,
  buildChangePageSizeUrl,
  buildProductionPageUrl
}
