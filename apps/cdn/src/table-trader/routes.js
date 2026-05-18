import { gameData } from "./context"
import {
  buildTraderScreen,
  DEFAULT_GROUP_ID,
  MAX_PAGE_SIZE,
  normalizeTraderGroupId
} from "./constants"

const normalizePageNumber = (value = -1) => {
  const page = Number(value)
  return Number.isFinite(page) ? page : -1
}

const buildTraderPageUrl = ({
  groupId = DEFAULT_GROUP_ID,
  type,
  page = -1
} = {}) => {
  const normalizedGroupId = normalizeTraderGroupId(groupId)
  const normalizedPage = normalizePageNumber(page)
  const screen = buildTraderScreen({ type })

  return new URL(
    `${gameData.link_base_pure}${screen}&group=${normalizedGroupId}&page=${normalizedPage}`,
    window.origin
  )
}

const buildChangePageSizeUrl = ({
  groupId = DEFAULT_GROUP_ID,
  type
} = {}) => {
  const normalizedGroupId = normalizeTraderGroupId(groupId)
  const screen = buildTraderScreen({ type })

  return new URL(
    `${gameData.link_base_pure}${screen}&group=${normalizedGroupId}&action=change_page_size`,
    window.origin
  )
}

const buildChangePageSizePayload = ({ pageSize = MAX_PAGE_SIZE } = {}) => ({
  page_size: Number(pageSize || MAX_PAGE_SIZE),
  h: gameData.csrf
})

const buildRestoreGroupUrl = () => new URL(
  `${gameData.link_base_pure}groups&ajax=load_villages_from_group`,
  window.origin
)

const buildRestoreGroupPayload = ({ groupId = DEFAULT_GROUP_ID } = {}) => ({
  group_id: normalizeTraderGroupId(groupId),
  h: gameData.csrf
})

export {
  buildChangePageSizePayload,
  buildChangePageSizeUrl,
  buildRestoreGroupPayload,
  buildRestoreGroupUrl,
  buildTraderPageUrl
}
