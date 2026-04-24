const PAGED_VIEW_OPTION_SELECTOR = "#paged_view_content > table.vis > option"
const PAGED_NAV_ITEM_SELECTOR = "a.paged-nav-item"

const normalizeNavUrl = (value = "") => {
  try {
    return new URL(String(value || "").trim(), window.origin).toString()
  } catch {
    return ""
  }
}

// Para uso em `page=-1`: retorna só os links das páginas extras,
// ignorando `page=0` e `page=-1`.
const getPages = (html = document) => {
  const optionUrls = Array.from(
    html.querySelectorAll(PAGED_VIEW_OPTION_SELECTOR)
  ).map((option) => option.value)

  const navUrls = Array.from(
    html.querySelectorAll(PAGED_NAV_ITEM_SELECTOR)
  ).map((navItem) => navItem.href)

  const urls = (optionUrls.length ? optionUrls : navUrls)
    .map(normalizeNavUrl)
    .filter(Boolean)
    .filter((url) => !url.includes("page=0") && !url.includes("page=-1"))

  const uniqueUrls = Array.from(new Set(urls))

  return {
    urls: uniqueUrls,
    numberPages: uniqueUrls.length
  }
}

export default getPages

export const getPageSize = (html = document) => {
  const pageSize = html.querySelector('input[name=page_size][type=text]')
  if (!pageSize) return null
  return Number(pageSize.value)
}

