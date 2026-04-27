import getSharedPages, { getPageSize } from "../stable-compat/getPages"
import { MAX_PAGE_SIZE } from "./constants"

const getPages = (html = document) => ({
  ...getSharedPages(html),
  pageSize: getPageSize(html)
})

const shouldUpdatePageSize = ({
  numberPages = 0,
  pageSize = 0,
  maxPageSize = MAX_PAGE_SIZE
} = {}) => Number(numberPages) > 0 && Number(pageSize) > 0 && Number(pageSize) < Number(maxPageSize)

export {
  getPages,
  shouldUpdatePageSize
}
