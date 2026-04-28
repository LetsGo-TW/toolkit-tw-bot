export function hasPayloadForNextPhase(payload) {
  return Array.isArray(payload) && payload.length > 0
}

export function hasAtLeastOneAttackUnit(templateFirstRow) {
  if (!templateFirstRow || typeof templateFirstRow !== 'object') return false
  return Object.values(templateFirstRow).some((value) => {
    const qty = Number(value)
    return Number.isFinite(qty) && qty > 0
  })
}

export function validateCommandForNextPhase(sourceData) {
  const hasPayload = hasPayloadForNextPhase(sourceData?.payload)
  const hasAtLeastOneAttack = hasAtLeastOneAttackUnit(sourceData?.templateFirstRow)

  if (hasPayload && hasAtLeastOneAttack) {
    return {
      ok: true,
      hasPayload,
      hasAtLeastOneAttack,
      errorMessage: ''
    }
  }

  if (!hasPayload && !hasAtLeastOneAttack) {
    return {
      ok: false,
      hasPayload,
      hasAtLeastOneAttack,
      errorMessage: 'Comando inválido para continuar: payload ausente e sem ataque.'
    }
  }

  if (!hasPayload) {
    return {
      ok: false,
      hasPayload,
      hasAtLeastOneAttack,
      errorMessage: 'Comando inválido para continuar: payload ausente.'
    }
  }

  return {
    ok: false,
    hasPayload,
    hasAtLeastOneAttack,
    errorMessage: 'Comando inválido para continuar: adicione ao menos 1 ataque.'
  }
}
