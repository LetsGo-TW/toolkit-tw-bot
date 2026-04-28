function renderTroopTemplatesTW(plannerTemplatesEl) {
  const select = plannerTemplatesEl.querySelector('#tw-template');
  if (!select) return null

  const render = (list = []) => {
    const items = Array.isArray(list) ? list : []
    if (!items.length) {
      select.innerHTML = `<option value="">Sem modelos</option>`
      return
    }
    const sorted = [...items].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', {
        sensitivity: 'base'
      })
    )
    select.innerHTML = sorted
      .map((t) => `<option value="${t.id}">${t.name}</option>`)
      .join('')
  }

  return { render }
}

export { renderTroopTemplatesTW }
