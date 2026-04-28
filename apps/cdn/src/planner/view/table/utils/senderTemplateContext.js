import { normalizeTemplateRows } from './normalizeTemplateRows'
import { dataUnits } from '../../..'

function isSpyOnlyTemplateRows({
  tplRowsNormalized = [],
  tplUnits = []
}) {
  if (!Array.isArray(tplRowsNormalized) || !tplRowsNormalized.length) return false
  if (!Array.isArray(tplUnits) || !tplUnits.length) return false
  let hasSpy = false
  for (let rowIdx = 0; rowIdx < tplRowsNormalized.length; rowIdx += 1) {
    const rowValues = Array.isArray(tplRowsNormalized[rowIdx]?.row) ? tplRowsNormalized[rowIdx].row : []
    for (let unitIdx = 0; unitIdx < tplUnits.length; unitIdx += 1) {
      const qty = Number(rowValues[unitIdx])
      if (!Number.isFinite(qty) || qty === 0) continue
      const unit = tplUnits[unitIdx]
      if (unit !== 'spy') return false
      hasSpy = true
    }
  }
  return hasSpy
}

export function senderTemplateContext({
  templateState,
  fakeLimitPercent,
  villagePoints,
  targetPlayerId = null,
  minSpyCommandConfig = null
}) {
  const template = templateState?.template
  const commandMode = String(template?.commandMode || '').trim().toLowerCase()
  const isSupportMode = commandMode === 'support' || commandMode === 'defense'
  const tplUnits = Array.isArray(template?.units) ? template.units : []
  const tplType = templateState?.template?.templateType
  const tplRowsNormalized = normalizeTemplateRows(template)
  if (!tplRowsNormalized.length) return null

  const tplValues = tplRowsNormalized.map(({ row }) => row)
  const fakeMinPopBase =
    !isSupportMode &&
    Number.isFinite(Number(villagePoints)) &&
    Number.isFinite(Number(fakeLimitPercent))
      ? Math.floor(Number(villagePoints) * Number(fakeLimitPercent) / 100)
      : null

  const isSpyOnlyTemplate = !isSupportMode && isSpyOnlyTemplateRows({ tplRowsNormalized, tplUnits })
  const targetPlayerIdNum = Number(targetPlayerId)
  const targetIsBarbarian = Number.isFinite(targetPlayerIdNum) ? targetPlayerIdNum <= 0 : false
  const minSpyPlayers = Number(minSpyCommandConfig?.players)
  const minSpyBarbarians = Number(minSpyCommandConfig?.barbarians)
  const minSpyForCommand = isSpyOnlyTemplate
    ? (
      targetIsBarbarian
        ? minSpyBarbarians
        : minSpyPlayers
    )
    : null
  const spyPop = Number(dataUnits?.get?.('spy')?.pop)
  const minSpyPopBase = (
    Number.isFinite(minSpyForCommand) &&
    minSpyForCommand > 0
  )
    ? Math.floor(minSpyForCommand * (Number.isFinite(spyPop) && spyPop > 0 ? spyPop : 2))
    : null
  const effectiveFakeMinPopBase = Number.isFinite(minSpyPopBase) && minSpyPopBase > 0
    ? minSpyPopBase
    : fakeMinPopBase

  return {
    template,
    commandMode,
    tplUnits,
    tplType,
    tplRowsNormalized,
    tplValues,
    fakeMinPopBase: effectiveFakeMinPopBase,
    fakeLimitPercent,
    villagePoints,
    targetPlayerId: Number.isFinite(targetPlayerIdNum) ? targetPlayerIdNum : null,
    minSpyCommandConfig,
    isSpyOnlyTemplate,
    minSpyForCommand: Number.isFinite(minSpyForCommand) ? minSpyForCommand : null
  }
}
