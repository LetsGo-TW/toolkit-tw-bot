const getASPages = (html = document) => {
  const plunderListNav = html.querySelector('#plunder_list_nav')
  const pageSize = Number(html.querySelector("input[id=farm_pagesize]")?.value || 0)
  if (!plunderListNav) return {
    pageSize,
    pages: []
  }
  const options = Array.from(plunderListNav.querySelectorAll('option.paged-nav-item')) || []
  if (options.length) {
    const pages = options
    .filter(item => !item.getAttribute('selected'))
    .map(item => item.value)
    return { pageSize, pages }
  }
  const pagedNavItem = Array.from(plunderListNav.querySelectorAll("a.paged-nav-item")) || []
  if (!pagedNavItem.length) return { pageSize, pages: pagedNavItem }
  const pages = pagedNavItem
    .filter(item => item.text.match(/[0-9]/ig))
    .map(item => item.href)

  return { pageSize, pages }
}

const getReportPages = (html = document) => {
  const options = Array.from(html.querySelectorAll('select[onchange] option')) || []

  const pageSize = Number(html.querySelector("input[name=page_size]")?.value || 0)
  if (options.length) {
    const pages = options
    .filter(item => !item.getAttribute('selected'))
    .map(item => item.value)
    return { pageSize, pages }
  }

  const pagedNavItem = Array.from(html.querySelectorAll("a.paged-nav-item")) || []
  if (!pagedNavItem.length) return { pageSize, pages: pagedNavItem }
  const pages = pagedNavItem
    .filter(item => item.text.match(/[0-9]/ig))
    .map(item => item.href)

  return { pageSize, pages }
}

const getOverviewPages = (html = document) => {
  const options = Array.from(html.querySelectorAll('option')) || []

  const pageSize = Number(html.querySelector("#pagination_form input[name=page_size]")?.value || 0)
  if (options.length) {
    const pages = options
    .filter(item => item.selected.match(/[0-9]/ig))
    .map(item => item.value)
    return { pageSize, pages }
  }

  const pagedNavItem = Array.from(html.querySelectorAll("a.paged-nav-item")) || []
  if (!pagedNavItem.length) return { pageSize, pages: pagedNavItem }
  const pages = pagedNavItem
    .filter(item => item.text.match(/[0-9]/ig))
    .map(item => item.href)

  return { pageSize, pages }
}

export { getASPages, getReportPages, getOverviewPages }


