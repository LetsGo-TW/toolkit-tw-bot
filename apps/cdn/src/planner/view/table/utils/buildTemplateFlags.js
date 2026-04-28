import { consoleDev } from '@toolkit-tw-bot/utils'
import { dataUnits } from '../../../index.js'

function buildTemplateFlags(dataSendersForTemplate) {
  if (!dataSendersForTemplate) {
    const lines = []
    lines.push('🚫 Nenhum modelo de tropas.')
    return { className: 'go-template-error', title: lines.join('<br>') }
  }
  const {
    overdue,
    absents,
    villageNotLimit,
    templateNotLimit,
    onTime,
    unitsInTemplate,
    slowestTemplateUnits,
    slowestTemplateUnit,
    senderHasSlowestTemplateUnit,
    commandMode,
    snobDistanceExceeded,
    snobMaxDistance,
    senderDistance,
    isNightBonus,
    nightWindowLabel,
    conflictTroopsMode,
    strictTroopsConflict,
    strictTroopsConflictMessage
  } = dataSendersForTemplate

  const normalizedSlowestTemplateUnits = Array.isArray(slowestTemplateUnits) && slowestTemplateUnits.length
    ? slowestTemplateUnits.filter(Boolean)
    : (slowestTemplateUnit ? [slowestTemplateUnit] : [])
  const slowestTemplateUnitsLabel = normalizedSlowestTemplateUnits
    .map((unit) => dataUnits?.get?.(unit)?.name || unit)
    .filter(Boolean)
    .join(' / ')

  consoleDev.debug(dataSendersForTemplate, {
    label: '[planner:template]',
    color: '#2f6feb',
    rateKey: 'planner:template:flags',
    maxLogs: 12,
    windowMs: 60_000,
  })

  let className = ''
  const lines = []
  if (templateNotLimit.size && commandMode === 'attack') {
    className = 'go-template-error'
    lines.push('🚫 Conflito de população(Modelo):')
    Array.from(templateNotLimit.entries()).forEach(([key, value]) => {
      lines.push(`Linha ${key} tem diferença de: ${value} pop`)
    })
  }
  if (villageNotLimit.size && commandMode === 'attack') {
    className = 'go-template-error'
    lines.push('🚫 Conflito de população(Aldeia✖️Modelo):')
    Array.from(villageNotLimit.entries()).forEach(([key, value]) => {
      lines.push(`Linha ${key} tem diferença de: ${value} pop para esta vila`)
    })
  }
  if (!onTime.size) {
    className = 'go-template-error'
    lines.push('🚫 Nenhuma tropa do modelo chega no horário.')
  }
  if (!senderHasSlowestTemplateUnit) {
    className = 'go-template-error'
    lines.push(
      normalizedSlowestTemplateUnits.length > 1
        ? '🚫 A vila não tem nenhuma das unidades mais lentas do template.'
        : '🚫 A vila não tem a unidade mais lenta do template.'
    )
    if (slowestTemplateUnitsLabel) lines.push(slowestTemplateUnitsLabel)
  }
  if (strictTroopsConflict && conflictTroopsMode === 'abort') {
    className = 'go-template-error'
    lines.push('🚫 Modo estrito: conflito de tropas (redistribuição desativada).')
    if (strictTroopsConflictMessage) lines.push(strictTroopsConflictMessage)
  }
  if (
    unitsInTemplate instanceof Set &&
    unitsInTemplate.has('snob') &&
    snobDistanceExceeded
  ) {
    className = 'go-template-error'
    const currentDistanceText = Number.isFinite(Number(senderDistance))
      ? Number(senderDistance).toFixed(2)
      : '---'
    const maxDistanceText = Number.isFinite(Number(snobMaxDistance))
      ? Number(snobMaxDistance)
      : '---'
    lines.push(`🚫 Nobres não podem viajar mais de ${maxDistanceText} campos (${currentDistanceText} campos).`)
  }
  if (isNightBonus) {
    if (!className) className = 'go-template-warn'
    lines.push(`⚠️ Chegada em bônus noturno${nightWindowLabel ? ` (${nightWindowLabel})` : ''}.`)
  }
  if (overdue.size) {
    const allSlowestTemplateUnitsOverdue = normalizedSlowestTemplateUnits.length > 0
      && normalizedSlowestTemplateUnits.every((unit) => overdue.has(unit))
    if (allSlowestTemplateUnitsOverdue) {
      className = 'go-template-error'
      lines.push(
        normalizedSlowestTemplateUnits.length > 1
          ? '🚫 Todas as tropas mais lentas do template passaram do horário.'
          : '🚫 A tropa mais lenta do template passou do horário.'
      )
      if (slowestTemplateUnitsLabel) lines.push(slowestTemplateUnitsLabel)
    }
    if (!className) {
      className = 'go-template-warn'
    }
    lines.push('⚠️ Tropas que passaram do horário:')
    overdue.forEach((unit) => {
      lines.push(dataUnits?.get?.(unit)?.name || unit)
    })
  }
  if (absents.size) {
    if (conflictTroopsMode === 'abort') {
      className = 'go-template-error'
      lines.push('🚫 Modo estrito: exige 100% de compatibilidade com o modelo.')
    }
    lines.push('⚠️ Tropas ausentes (comparado com o modelo):')
    absents.forEach((unit) => {
      lines.push(dataUnits?.get?.(unit)?.name || unit)
    })
  }
  if (!className && !absents.size) {
    className = 'go-template-ok'
    lines.push('✅ 100% correspondente com o modelo.')
  }
  return { className, title: lines.join('<br>') }
}

export { buildTemplateFlags }
