import test from 'node:test'
import assert from 'node:assert/strict'
import { calcTemplateRowsForSender } from './calcTemplateRowsForSender.js'

test('calcTemplateRowsForSender distribui fixed e all respeitando disponível', () => {
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

  const rows = calcTemplateRowsForSender({
    tplUnits,
    tplValues,
    senderUnits,
    unitIndexByName
  })

  assert.deepEqual(rows, [
    [100, 0, 40],
    [50, 70, 0],
    [0, 20, 0]
  ])
})

test('calcTemplateRowsForSender limita fixed quando sender não tem suficiente', () => {
  const rows = calcTemplateRowsForSender({
    tplUnits: ['spear'],
    tplValues: [[100], [80], [-1]],
    senderUnits: [150],
    unitIndexByName: new Map([['spear', 0]])
  })

  assert.deepEqual(rows, [[100], [50], [0]])
})

test('calcTemplateRowsForSender com múltiplos all na mesma unidade usa o primeiro', () => {
  const rows = calcTemplateRowsForSender({
    tplUnits: ['spear', 'sword'],
    tplValues: [[-1, 0], [-1, 0]],
    senderUnits: [120, 30],
    unitIndexByName: new Map([
      ['spear', 0],
      ['sword', 1]
    ])
  })

  assert.deepEqual(rows, [[120, 0], [0, 0]])
})

test('calcTemplateRowsForSender respeita unitIndexByName quando ordem do sender é diferente', () => {
  const rows = calcTemplateRowsForSender({
    tplUnits: ['spear', 'sword'],
    tplValues: [[50, -1]],
    // ordem: sword, spear
    senderUnits: [30, 90],
    unitIndexByName: new Map([
      ['sword', 0],
      ['spear', 1]
    ])
  })

  assert.deepEqual(rows, [[50, 30]])
})

test('calcTemplateRowsForSender com uma tropa distribui fixed e all corretamente', () => {
  const rows = calcTemplateRowsForSender({
    tplUnits: ['axe'],
    tplValues: [[40], [-1]],
    senderUnits: [100],
    unitIndexByName: new Map([['axe', 0]])
  })

  console.log('[calcTemplateRowsForSender][uma-tropa]', rows)
  assert.deepEqual(rows, [[40], [60]])
})
