import test from 'node:test'
import assert from 'node:assert/strict'
import { sumTemplateByUnitAllForSender } from './sumTemplateByUnit.js'

test('sumTemplateByUnitAllForSender calcula sobra por unidade com all(-1)', () => {
  const tplUnits = ['spear', 'sword', 'axe']
  const tplValues = [
    [100, 0, -1],
    [50, -1, 0],
    [0, 20, 0]
  ]
  const senderUnits = [300, 90, 40]
  const unitIndexByName = new Map([
    ['spear', 0],
    ['sword', 1],
    ['axe', 2]
  ])

  const result = sumTemplateByUnitAllForSender({
    tplUnits,
    tplValues,
    senderUnits,
    unitIndexByName,
  })

  console.log({tplValues, senderUnits})
  console.log(result)
  assert.deepEqual(Object.fromEntries(result), {
    spear: 0,
    sword: 70,
    axe: 40
  })
})

test('sumTemplateByUnitAllForSender: estresse de casos all', () => {
  const tplUnits = ['spear', 'sword', 'axe']
  const unitIndexByName = new Map([
    ['spear', 0],
    ['sword', 1],
    ['axe', 2]
  ])

  const cases = [
    {
      name: 'sender 0 em unidade com fixo + all => all fica 0',
      tplValues: [[100, 0, 0], [-1, 0, 0]],
      senderUnits: [0, 50, 10],
      expected: { spear: 0, sword: 0, axe: 0 }
    },
    {
      name: 'sender igual ao fixo => all fica 0',
      tplValues: [[100, 0, 0], [-1, 0, 0]],
      senderUnits: [100, 50, 10],
      expected: { spear: 0, sword: 0, axe: 0 }
    },
    {
      name: 'sender maior que fixo => all recebe sobra',
      tplValues: [[100, 0, 0], [-1, 0, 0]],
      senderUnits: [180, 50, 10],
      expected: { spear: 80, sword: 0, axe: 0 }
    },
    {
      name: 'all em múltiplas unidades no mesmo template',
      tplValues: [[50, 20, 0], [-1, -1, 0], [0, 0, -1]],
      senderUnits: [120, 35, 10],
      expected: { spear: 70, sword: 15, axe: 10 }
    },
    {
      name: 'duas linhas com all na mesma unidade mantém valor final consistente',
      tplValues: [[50, 0, 0], [-1, 0, 0], [-1, 0, 0]],
      senderUnits: [170, 35, 10],
      expected: { spear: 120, sword: 0, axe: 0 }
    }
  ]

  cases.forEach(({ name, tplValues, senderUnits, expected }) => {
    const result = sumTemplateByUnitAllForSender({
      tplUnits,
      tplValues,
      senderUnits,
      unitIndexByName,
    })
    console.log({tplValues, senderUnits})
    console.log(result)
    assert.deepEqual(Object.fromEntries(result), expected, name)
  })
})
