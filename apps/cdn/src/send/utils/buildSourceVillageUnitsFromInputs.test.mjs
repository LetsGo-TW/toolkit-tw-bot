import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSourceVillageUnitsFromInputs } from './buildSourceVillageUnitsFromInputs.js'

test('buildSourceVillageUnitsFromInputs monta units e byUnit pela ordem do mundo', () => {
  const unitsOrder = ['spear', 'sword', 'axe']
  const inputs = [
    { name: 'axe', dataset: { allCount: '30' } },
    { name: 'spear', dataset: { allCount: '100' } },
    { name: 'sword', dataset: { allCount: '25' } },
  ]

  const result = buildSourceVillageUnitsFromInputs(inputs, unitsOrder)

  assert.deepEqual(result.units, [100, 25, 30])
  assert.deepEqual(Object.fromEntries(result.byUnit), {
    spear: 100,
    sword: 25,
    axe: 30
  })
})

test('buildSourceVillageUnitsFromInputs usa 0 quando input não existe/é inválido', () => {
  const unitsOrder = ['spear', 'sword', 'axe']
  const inputs = [
    { name: 'spear', dataset: { allCount: '10' } },
    { name: 'sword', dataset: { allCount: 'x' } },
  ]

  const result = buildSourceVillageUnitsFromInputs(inputs, unitsOrder)

  assert.deepEqual(result.units, [10, 0, 0])
})

