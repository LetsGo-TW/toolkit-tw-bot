function createTemplateError(plannerTemplates) {
  const listEl = plannerTemplates.querySelector('ul.go-table-template-error')
  const items = listEl
    ? new Map(
        Array.from(listEl.querySelectorAll('li.go-table-template-error-item')).map((li) => [
          li.dataset.error,
          li,
        ])
      )
    : new Map()

  const show = (key, msg) => {
    if (!listEl) return
    const item = items.get(key)
    if (!item) return
    if (msg) {
      const messageEl = item.querySelector('.go-error-message')
      if (messageEl) messageEl.textContent = msg
    }
    item.classList.add('show')
    listEl.classList.add('show')
  }

  const hide = (key) => {
    if (!listEl) return
    if (key) {
      const item = items.get(key)
      if (item) item.classList.remove('show')
    } else {
      items.forEach((item) => item.classList.remove('show'))
    }
    const anyVisible = Array.from(items.values()).some((item) => item.classList.contains('show'))
    if (!anyVisible) listEl.classList.remove('show')
  }

  const destroy = () => {
    hide()
  }

  return { show, hide, destroy }
}

export { createTemplateError }
