import test from 'node:test'
import assert from 'node:assert/strict'
import { sumTemplateByUnitFixed } from './sumTemplateByUnit.js'

test('sumTemplateByUnitFixed soma apenas valores fixos > 0', () => {
  const tplUnits = ['spear', 'sword', 'axe']
  const tplValues = [
    [100, 0, -1],
    [50, 20, 0],
    [0, 0, 30],
    [null, '7', 'banana']
  ]

  const result = sumTemplateByUnitFixed({ tplUnits, tplValues })
  console.log(tplValues, result)
  assert.deepEqual(Object.fromEntries(result), {
    spear: 150,
    sword: 27,
    axe: 30
  })
})

