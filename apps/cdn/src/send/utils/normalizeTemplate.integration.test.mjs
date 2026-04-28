import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceVillageUnitsFromInputs } from './buildSourceVillageUnitsFromInputs.js'
import { normalizeTemplateForCommand } from './normalizeTemplateForCommand.js'

function makeInput(name, allCount) {
  return {
    name,
    dataset: { allCount: String(allCount) }
  }
}

test('integration: getPlace inputs + normalize => sucesso com linhas válidas', () => {
  const worldUnits = ['spear', 'axe', 'spy']
  const inputs = [
    makeInput('spear', 300),
    makeInput('axe', 600),
    makeInput('spy', 50)
  ]
  const sourceVillageUnits = buildSourceVillageUnitsFromInputs(inputs, worldUnits)
  const template = {
    units: ['axe', 'spear', 'spy'],
    values: [
      [100, 50, 1],
      [80, 40, 1]
    ]
  }

  const normalized = normalizeTemplateForCommand(template, worldUnits, {
    sourceVillageUnits,
    mode: 'send',
    commandType: 'attack',
    villagePoints: 12000,
    fakeLimitPercent: 1
  })

  assert.equal(normalized.values.length, 2)
  assert.equal(normalized.firstRowMap.axe > 0, true)
  assert.equal(normalized.firstRowMap.spear > 0, true)
})

test('integration: getPlace inputs + normalize => erro funcional (nenhuma linha possível)', () => {
  const worldUnits = ['spear', 'axe']
  const inputs = [
    makeInput('spear', 5),
    makeInput('axe', 5)
  ]
  const sourceVillageUnits = buildSourceVillageUnitsFromInputs(inputs, worldUnits)
  const template = {
    units: ['spear', 'axe'],
    values: [
      [50, 50],
      [50, 50]
    ]
  }

  const normalized = normalizeTemplateForCommand(template, worldUnits, {
    sourceVillageUnits,
    mode: 'send',
    commandType: 'attack',
    villagePoints: 20000,
    fakeLimitPercent: 1
  })

  assert.equal(normalized.values.length, 0)
  assert.equal(normalized.meta.conflicts.attacks, true)
})

