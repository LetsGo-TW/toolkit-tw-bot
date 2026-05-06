function getGroupsInOverviews(html = document) {
  const groups = Array.from(html.querySelectorAll('.group-menu-item')).map(item => {
    const id = item.dataset.groupId
    const type = item.dataset.groupType
    const name = type === 'all' ? item.innerText.match(/[a-z]{1,}/)[0] : item.innerText
    return { id, type, name }
  })

  return groups
}

export { getGroupsInOverviews }
