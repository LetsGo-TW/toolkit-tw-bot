import { createDropdown } from "../../../components/dropdown"

let templates = [
  {id: crypto.randomUUID(), name: 'Full OFF'},
  {id: crypto.randomUUID(), name: 'Full DEF'},
  {id: crypto.randomUUID(), name: 'NT 4 Marron'},
  {id: crypto.randomUUID(), name: 'FAKE CATAS'},
  {id: crypto.randomUUID(), name: 'NT 4 verde'},
]

function getTemplateMode(template, fallback = 'attack') {
  const mode = String(template?.commandMode || '').trim().toLowerCase()
  if (mode === 'attack' || mode === 'support') return mode
  if (mode === 'defense') return 'support'

  const legacyType = String(template?.commandType || '').trim().toLowerCase()
  if (legacyType === 'support' || legacyType === 'defense') return 'support'
  if (legacyType === 'attack') return 'attack'

  const id = String(template?._id || template?.id || '').trim()
  if (id) {
    const parts = id.split(':')
    const modeFromId = String(parts[parts.length - 2] || '').trim().toLowerCase()
    if (modeFromId === 'attack' || modeFromId === 'support') return modeFromId
    if (modeFromId === 'defense') return 'support'
  }
  return fallback
}

function renderMenu(menu, plannerTemplates) {
  if (!menu) return
  const currentMode = String(plannerTemplates?.dataset?.commandMode || 'attack')
    .trim()
    .toLowerCase() === 'support'
      ? 'support'
      : 'attack'
  const items = [...templates]
    .filter((tpl) => getTemplateMode(tpl, currentMode) === currentMode)
    .sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  )
  if (!items.length) {
    menu.innerHTML = `<span class="go-dd-no-content">Vazio</span>`
    return
  }
  menu.innerHTML = items
    .map(
      (t) => {
        const id = t._id || t.id || ''
        return `
        <span data-value="${id}" data-name="${t.name}">
          ${t.name}
          <img
            data-title="Apagar Modelo"
            alt="Excluir"
            src="https://dsbr.innogamescdn.com/asset/98f3b7c4/graphic/delete_14.png"
            class="float_right go-dd-delete"
          >
        </span>
      `
      }
    )
    .join('')
}

function renderDropdown(plannerTemplates) {
  const input = plannerTemplates.querySelector('#go-input-template-name');
  const label = plannerTemplates.querySelector('label[for="go-input-template-name"]');
  const menu = plannerTemplates.querySelector('#go-dp-templates');
  const btnUpdate = plannerTemplates.querySelector('#go-btn-update');
  const btnSaveNew = plannerTemplates.querySelector('#go-btn-save-new');

  const setTemplates = (list = []) => {
    templates = Array.isArray(list) ? list : []
    renderMenu(menu, plannerTemplates)
  }

  const dd = createDropdown({
    btn: label,
    menu,
    matchSelector: 'span[data-value]',
    onOpen: () => renderMenu(menu, plannerTemplates),
    onSelect: (item, e) => {
      if (e.target.closest('.go-dd-delete')) {
        const id = item.dataset.value
        plannerTemplates.dispatchEvent(
          new CustomEvent('go:template:delete', {
            bubbles: true,
            detail: { id }
          })
        )
        return // não seleciona
      }

      // seleção normal
      input.value = item.dataset.name || item.textContent.trim()
      plannerTemplates.dispatchEvent(
        new CustomEvent('go:template:select', {
          bubbles: true,
          detail: { id: item.dataset.value }
        })
      )
      dd.close()
    },
  })

  const saveTemplate = (event, action = 'new') => {
    event?.preventDefault?.()
    const nextAction = action === 'update' ? 'update' : 'new'
    const btn = nextAction === 'update' ? btnUpdate : btnSaveNew
    if (btn?.disabled) return
    const name = input.value?.trim()
    if (!name) return
    plannerTemplates.dispatchEvent(
      new CustomEvent('go:template:save', {
        bubbles: true,
        detail: { name, action: nextAction }
      })
    )
  }
  const onSaveUpdate = (event) => saveTemplate(event, 'update')
  const onSaveNew = (event) => saveTemplate(event, 'new')
  const onInputFocus = () => dd?.open()
  const onInputClick = () => dd?.open()
  const onInputKeydown = (event) => {
    if (event.key !== 'Enter') return
    // Enter cria novo por padrão para evitar sobrescrever modelo selecionado sem intenção.
    saveTemplate(event, 'new')
  }
  const onCommandModeChanged = () => renderMenu(menu, plannerTemplates)

  btnUpdate?.addEventListener('click', onSaveUpdate, true)
  btnSaveNew?.addEventListener('click', onSaveNew, true)
  input.addEventListener('focus', onInputFocus)
  input.addEventListener('click', onInputClick) // opcional
  input.addEventListener('keydown', onInputKeydown)
  plannerTemplates.addEventListener('go:command-mode:changed', onCommandModeChanged)

  const unbind = () => {
    btnUpdate?.removeEventListener('click', onSaveUpdate, true)
    btnSaveNew?.removeEventListener('click', onSaveNew, true)
    input?.removeEventListener('focus', onInputFocus)
    input?.removeEventListener('click', onInputClick) // opcional
    input?.removeEventListener('keydown', onInputKeydown)
    plannerTemplates.removeEventListener('go:command-mode:changed', onCommandModeChanged)
    dd?.destroy();
  }

  return { destroy: unbind, setTemplates };
}

export { renderDropdown }
