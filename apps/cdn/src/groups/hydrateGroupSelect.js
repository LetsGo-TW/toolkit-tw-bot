import Groups from ".";

const handlerGroups = new Groups()

async function hydrateGroupsSelect(groupTarget) {
  if (!groupTarget) return

  const pendingValue = String(groupTarget.dataset.pendingValue ?? groupTarget.value ?? 0)
  groupTarget.dataset.pendingValue = pendingValue
  groupTarget.dataset.loading = 'true'
  groupTarget.disabled = true
  groupTarget.innerHTML = '<option value="0">Carregando grupos...</option>'

  try {
    const groups = await handlerGroups.get()
    const htmlGroup = [
      ...groups.map(({ group_id, name }) => {
        if (!name) return '<option disabled=""></option>'
        return `<option value="${group_id}">${name}</option>`
      })
    ]

    groupTarget.innerHTML = htmlGroup.join('')
    groupTarget.value = pendingValue

    if (groupTarget.value !== pendingValue) {
      groupTarget.value = '0'
    }
  } catch (error) {
    if (
      error?.message === 'Identified bot protection'
      || ProtectingBot["bot-protect-all-in-game"].active()
    ) {
      try { ProtectingBot.redirect() } catch { /* intentionally empty */ }
      return
    }

    console.error(error.message || error.toString())
    groupTarget.innerHTML = '<option value="0">Falha ao carregar grupos</option>'
  } finally {
    delete groupTarget.dataset.loading
    groupTarget.disabled = false
  }
}

export { hydrateGroupsSelect }
