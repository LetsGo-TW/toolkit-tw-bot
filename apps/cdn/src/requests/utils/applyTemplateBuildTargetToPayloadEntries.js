function toPayloadEntries(payloadCommand) {
  if (Array.isArray(payloadCommand)) {
    return payloadCommand.reduce((acc, entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return acc
      const [name, value] = entry
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  if (payloadCommand && typeof payloadCommand === 'object') {
    return Object.entries(payloadCommand).reduce((acc, [name, value]) => {
      if (!name) return acc
      acc.push([String(name), value ?? ''])
      return acc
    }, [])
  }
  return []
}

function normalizeBuildTarget(value) {
  const normalized = String(value || '').trim().replace(/^building:/, '')
  return normalized || ''
}

function hasTemplateCatapult(templateNormalized = null) {
  const units = Array.isArray(templateNormalized?.units) ? templateNormalized.units : []
  const values = Array.isArray(templateNormalized?.values) ? templateNormalized.values : []
  const catapultIndex = units.indexOf('catapult')
  if (catapultIndex < 0) return false
  return values.some((row) => {
    const qty = Number(row?.[catapultIndex])
    return Number.isFinite(qty) && qty > 0
  })
}

export function applyTemplateBuildTargetToPayloadEntries(payloadCommand, {
  templateNormalized
} = {}) {
  const entries = toPayloadEntries(payloadCommand)
  const buildTarget = normalizeBuildTarget(templateNormalized?.buildTarget)
  if (!buildTarget || !hasTemplateCatapult(templateNormalized)) return entries

  let replaced = false
  const nextEntries = entries.map(([name, value]) => {
    if (String(name) !== 'building') return [String(name), value ?? '']
    replaced = true
    return ['building', buildTarget]
  })

  if (!replaced) nextEntries.push(['building', buildTarget])
  return nextEntries
}
